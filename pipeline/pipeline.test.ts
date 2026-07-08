// =============================================================================
// pipeline/pipeline.test.ts  [Person C]
// =============================================================================
// The six tests that define "done" (PRD §11). The pure helpers used by T1 and
// T2 (isVerbatimSubstring, claimsDisagree) are already implemented in the
// stubs, so a couple of real assertions are wired up now to prove the harness
// works. The DB-touching tests remain .todo until you implement the modules.
// =============================================================================

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isVerbatimSubstring,
  runExtraction,
  type ExtractionLlm,
  type RunExtractionOptions,
} from './extract.ts';
import { claimsDisagree, type ClaimForCompare } from './disagreement.ts';
import { CLAIM_TYPES, CONTENT_SHAPE, ORIGIN_TYPE } from '../shared/constants.ts';

const [JOURNALIST_KILLED_CLAIM_TYPE, CASUALTY_COUNT_CLAIM_TYPE] = CLAIM_TYPES;
const [SEARCH_DISCOVERED_ORIGIN_TYPE] = ORIGIN_TYPE;
const [PROSE_CONTENT_SHAPE] = CONTENT_SHAPE;
const ORIGINAL_MAX_EXTRACT_PER_RUN = process.env.MAX_EXTRACT_PER_RUN;

type FakeRawItem = {
  id: string;
  raw_text: string;
  headline: string | null;
  origin_type: string;
  content_shape: string;
  processed: boolean;
  created_at: string;
};

type FakeClaimInsert = {
  raw_item_id: string;
  claim_type: string;
  value: unknown;
  raw_quote: string;
  date_occurred: string | null;
  location: string | null;
  is_unverified_signal: boolean;
};

type FakeFilter = {
  column: string;
  value: unknown;
};

type FakeQueryResult<T> = Promise<{ data: T | null; error: Error | null }>;

let fakeRawItemCounter = 0;

function makeRawItem(overrides: Partial<FakeRawItem> = {}): FakeRawItem {
  fakeRawItemCounter += 1;
  return {
    id: `raw-item-${fakeRawItemCounter}`,
    raw_text: 'No supported claim appears here.',
    headline: 'Test headline',
    origin_type: SEARCH_DISCOVERED_ORIGIN_TYPE,
    content_shape: PROSE_CONTENT_SHAPE,
    processed: false,
    created_at: new Date(2024, 0, fakeRawItemCounter).toISOString(),
    ...overrides,
  };
}

class FakeSupabaseQuery {
  private filters: FakeFilter[] = [];
  private updateValues: Record<string, unknown> = {};
  private limitCount = Number.POSITIVE_INFINITY;

  constructor(
    private readonly db: FakeSupabaseClient,
    private readonly table: string,
  ) {}

  select(_columns: string): this {
    return this;
  }

  eq(column: string, value: unknown): this | FakeQueryResult<null> {
    this.filters.push({ column, value });
    if (Object.keys(this.updateValues).length > 0) {
      return this.executeUpdate();
    }
    return this;
  }

  order(_column: string, _options: { ascending: boolean }): this {
    return this;
  }

  limit(count: number): FakeQueryResult<FakeRawItem[]> {
    this.limitCount = count;
    return this.executeSelect();
  }

  insert(rows: FakeClaimInsert[]): FakeQueryResult<null> {
    if (this.table !== 'claims') {
      return Promise.resolve({
        data: null,
        error: new Error(`Unexpected insert into ${this.table}`),
      });
    }
    this.db.claims.push(...rows);
    return Promise.resolve({ data: null, error: null });
  }

  update(values: Record<string, unknown>): this {
    this.updateValues = values;
    return this;
  }

  private executeSelect(): FakeQueryResult<FakeRawItem[]> {
    if (this.table !== 'raw_items') {
      return Promise.resolve({
        data: null,
        error: new Error(`Unexpected select from ${this.table}`),
      });
    }

    const rows = this.db.rawItems
      .filter((row) =>
        this.filters.every(
          (filter) => row[filter.column as keyof FakeRawItem] === filter.value,
        ),
      )
      .slice(0, this.limitCount);

    return Promise.resolve({ data: rows, error: null });
  }

  private executeUpdate(): FakeQueryResult<null> {
    if (this.table !== 'raw_items') {
      return Promise.resolve({
        data: null,
        error: new Error(`Unexpected update to ${this.table}`),
      });
    }

    const updateKeys = Object.keys(this.updateValues);
    if (updateKeys.some((key) => key !== 'processed')) {
      return Promise.resolve({
        data: null,
        error: new Error(`Unexpected raw_items update: ${updateKeys.join(',')}`),
      });
    }

    for (const row of this.db.rawItems) {
      if (
        this.filters.every(
          (filter) => row[filter.column as keyof FakeRawItem] === filter.value,
        )
      ) {
        row.processed = Boolean(this.updateValues.processed);
      }
    }

    return Promise.resolve({ data: null, error: null });
  }
}

class FakeSupabaseClient {
  claims: FakeClaimInsert[] = [];

  constructor(readonly rawItems: FakeRawItem[]) {}

  from(table: string): FakeSupabaseQuery {
    return new FakeSupabaseQuery(this, table);
  }

  asExtractionDb(): RunExtractionOptions['db'] {
    return this as unknown as RunExtractionOptions['db'];
  }
}

afterEach(() => {
  if (ORIGINAL_MAX_EXTRACT_PER_RUN === undefined) {
    delete process.env.MAX_EXTRACT_PER_RUN;
  } else {
    process.env.MAX_EXTRACT_PER_RUN = ORIGINAL_MAX_EXTRACT_PER_RUN;
  }
});

describe('pipeline — pure helpers (already implemented)', () => {
  it('isVerbatimSubstring: rejects a hallucinated quote, accepts a real one', () => {
    const rawText =
      'Medical officials said 15 people were killed in Rafah on Wednesday.';
    expect(isVerbatimSubstring('15 people were killed in Rafah', rawText)).toBe(true);
    expect(isVerbatimSubstring('42 people were killed in Khan Younis', rawText)).toBe(
      false,
    );
  });

  it('claimsDisagree: 15 vs 20, same day/location/discriminators => disagree', () => {
    const a: ClaimForCompare = {
      id: 'a',
      claim_type: 'casualty_count',
      date_occurred: '2024-05-01',
      location: 'Rafah',
      value: { count: 15, group: 'palestinian', subtype: 'total' },
    };
    const b: ClaimForCompare = {
      id: 'b',
      claim_type: 'casualty_count',
      date_occurred: '2024-05-01',
      location: 'Rafah',
      value: { count: 20, group: 'palestinian', subtype: 'total' },
    };
    expect(claimsDisagree(a, b)).toBe(true);
  });

  it('claimsDisagree: different subtype => NOT a disagreement', () => {
    const a: ClaimForCompare = {
      id: 'a',
      claim_type: 'casualty_count',
      date_occurred: '2024-05-01',
      location: 'Rafah',
      value: { count: 15, group: 'palestinian', subtype: 'total' },
    };
    const b: ClaimForCompare = {
      id: 'b',
      claim_type: 'casualty_count',
      date_occurred: '2024-05-01',
      location: 'Rafah',
      value: { count: 4, group: 'palestinian', subtype: 'child' },
    };
    expect(claimsDisagree(a, b)).toBe(false);
  });

  it('claimsDisagree: agreeing counts => NOT a disagreement', () => {
    const a: ClaimForCompare = {
      id: 'a',
      claim_type: 'casualty_count',
      date_occurred: '2024-05-01',
      location: 'Rafah',
      value: { count: 15, group: 'palestinian', subtype: 'total' },
    };
    const b: ClaimForCompare = { ...a, id: 'b' };
    expect(claimsDisagree(a, b)).toBe(false);
  });
});

describe('pipeline — integration (implement, then convert from todo)', () => {
  // T1: a raw_quote NOT present in raw_text is rejected + never inserted; a
  // verbatim quote is inserted. (The pure half is covered above; this is the
  // full extract.ts path with the DB.)
  it('T1: extract rejects non-verbatim quote at the DB boundary', async () => {
    process.env.MAX_EXTRACT_PER_RUN = '20';
    const verbatimQuote =
      'Medical officials said 15 people were killed in Rafah on Wednesday.';
    const db = new FakeSupabaseClient([
      makeRawItem({
        raw_text: `Opening paragraph. ${verbatimQuote} Closing paragraph.`,
      }),
    ]);
    const rawLlmResponse = JSON.stringify({
      claims: [
        {
          claim_type: CASUALTY_COUNT_CLAIM_TYPE,
          value: { count: 99, group: 'palestinian', subtype: 'total' },
          raw_quote: 'Officials said 99 people were killed in Khan Younis.',
          date_occurred: '2024-05-01',
          location: 'Khan Younis',
        },
        {
          claim_type: CASUALTY_COUNT_CLAIM_TYPE,
          value: { count: 15, group: 'palestinian', subtype: 'total' },
          raw_quote: verbatimQuote,
          date_occurred: '2024-05-01',
          location: 'Rafah',
        },
      ],
    });
    const llm = vi.fn<ExtractionLlm>(async () => rawLlmResponse);
    const logs: Record<string, unknown>[] = [];

    await runExtraction({
      db: db.asExtractionDb(),
      llm,
      logger: (entry) => logs.push(entry),
    });

    expect(db.claims).toHaveLength(1);
    expect(db.claims[0]).toMatchObject({
      claim_type: CASUALTY_COUNT_CLAIM_TYPE,
      value: { count: 15, group: 'palestinian', subtype: 'total' },
      raw_quote: verbatimQuote,
      date_occurred: '2024-05-01',
      location: 'Rafah',
    });
    expect(db.claims[0]?.is_unverified_signal).toBe(false);
    expect(db.rawItems[0]?.processed).toBe(true);
    expect(logs.some((entry) => entry.reason === 'raw_quote_not_verbatim')).toBe(true);
  });

  // T2: 15 vs 20 casualty claims -> event.has_disagreement=true AND both claims
  // remain in the DB unmodified (append-only proof).
  it.todo('T2: disagreement flags event and never mutates claims');

  // T3: two agreeing claims -> no disagreement flag.
  it.todo('T3: agreeing claims produce no disagreement flag');

  // T4: a value failing its zod schema (e.g. count as string) is rejected
  // before insert, logged, never coerced.
  it('T4: zod-invalid value rejected before insert', async () => {
    process.env.MAX_EXTRACT_PER_RUN = '20';
    const verbatimQuote = 'Rights groups say 3 journalists have been killed.';
    const db = new FakeSupabaseClient([
      makeRawItem({
        raw_text: `Context. ${verbatimQuote}`,
      }),
    ]);
    const rawLlmResponse = JSON.stringify({
      claims: [
        {
          claim_type: JOURNALIST_KILLED_CLAIM_TYPE,
          value: { count: '3', names: ['A. Reporter'] },
          raw_quote: verbatimQuote,
          date_occurred: '2024-05-01',
          location: 'Gaza',
        },
      ],
    });
    const llm = vi.fn<ExtractionLlm>(async () => rawLlmResponse);
    const logs: Record<string, unknown>[] = [];

    await runExtraction({
      db: db.asExtractionDb(),
      llm,
      logger: (entry) => logs.push(entry),
    });

    expect(db.claims).toHaveLength(0);
    expect(db.rawItems[0]?.processed).toBe(true);
    expect(
      logs.some(
        (entry) =>
          entry.reason === 'invalid_value' && entry.raw_llm_response === rawLlmResponse,
      ),
    ).toBe(true);
  });

  // T5: cluster groups two same-event claims from different sources into one event.
  it.todo('T5: clustering groups same-event claims');

  // T6: a failed (timeout/429) LLM call leaves processed=false; a completed call
  // with zero valid claims sets processed=true.
  it('T6: transient failure keeps processed=false; completed-but-empty sets true', async () => {
    process.env.MAX_EXTRACT_PER_RUN = '20';
    const failedRow = makeRawItem({ id: 'failed-row' });
    const emptyCompletedRow = makeRawItem({ id: 'empty-completed-row' });
    const db = new FakeSupabaseClient([failedRow, emptyCompletedRow]);
    const llm = vi
      .fn<ExtractionLlm>()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(JSON.stringify({ claims: [] }));
    const logs: Record<string, unknown>[] = [];

    await runExtraction({
      db: db.asExtractionDb(),
      llm,
      logger: (entry) => logs.push(entry),
    });

    expect(failedRow.processed).toBe(false);
    expect(emptyCompletedRow.processed).toBe(true);
    expect(db.claims).toHaveLength(0);
    expect(llm).toHaveBeenCalledTimes(2);
    expect(
      logs.some(
        (entry) =>
          entry.event === 'extraction.row_failed' &&
          entry.reason === 'llm_call_failed' &&
          entry.raw_item_id === failedRow.id,
      ),
    ).toBe(true);
    expect(
      logs.some(
        (entry) =>
          entry.event === 'extraction.row_completed' &&
          entry.extracted_count === 0 &&
          entry.inserted_count === 0 &&
          entry.raw_item_id === emptyCompletedRow.id,
      ),
    ).toBe(true);
  });
});
