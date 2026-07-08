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
import { computeSnapshots, type ComputeSnapshotsOptions } from './snapshots.ts';
import {
  runClustering,
  type ClusterEmbedder,
  type RunClusteringOptions,
} from './cluster.ts';
import {
  claimsDisagree,
  runDisagreementDetection,
  type ClaimForCompare,
  type RunDisagreementDetectionOptions,
} from './disagreement.ts';
import {
  CLAIM_TYPES,
  CONTENT_SHAPE,
  DISCOVERY_TIER,
  EVENT_CATEGORY,
  ORIGIN_TYPE,
} from '../shared/constants.ts';

const [JOURNALIST_KILLED_CLAIM_TYPE, CASUALTY_COUNT_CLAIM_TYPE] = CLAIM_TYPES;
const [, , ESTABLISHED_DISCOVERY_TIER, EMERGING_UNVERIFIED_DISCOVERY_TIER] =
  DISCOVERY_TIER;
const [, CASUALTY_EVENT_CATEGORY] = EVENT_CATEGORY;
const [SEARCH_DISCOVERED_ORIGIN_TYPE] = ORIGIN_TYPE;
const [PROSE_CONTENT_SHAPE] = CONTENT_SHAPE;
const PALESTINIANS_KILLED_COUNTER = 'palestinians_killed';
const CHILDREN_KILLED_COUNTER = 'children_killed';
const ORIGINAL_MAX_EXTRACT_PER_RUN = process.env.MAX_EXTRACT_PER_RUN;

type FakeRawItem = {
  id: string;
  source_id: string;
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

type FakeClaimRow = FakeClaimInsert & {
  id: string;
  created_at: string;
  lat: number | null;
  lng: number | null;
  geo_confidence: number | null;
};

type FakeEventRow = {
  id: string;
  title: string | null;
  neutral_summary: string | null;
  location: string | null;
  lat: number | null;
  lng: number | null;
  category: string | null;
  event_date: string | null;
  framing_notes: unknown | null;
  has_disagreement: boolean;
  disagreement_note: string | null;
  first_seen_at: string;
  last_updated_at: string;
};

type FakeEventClaimRow = {
  event_id: string;
  claim_id: string;
};

type FakeSourceRow = {
  id: string;
  discovery_tier: string | null;
};

type FakeCounterSnapshotRow = {
  id: string;
  counter_key: string;
  as_of_date: string;
  low_value: number | null;
  high_value: number | null;
  primary_source_ids: string[] | null;
  claim_count: number | null;
  computed_at: string;
};

type FakeCounterSnapshotInsert = Omit<FakeCounterSnapshotRow, 'id' | 'computed_at'>;

type FakeFilter = {
  column: string;
  value: unknown;
};

type FakeQueryResult<T> = Promise<{ data: T | null; error: Error | null }>;

let fakeRawItemCounter = 0;
let fakeClaimCounter = 0;
let fakeSnapshotCounter = 0;

function makeRawItem(overrides: Partial<FakeRawItem> = {}): FakeRawItem {
  fakeRawItemCounter += 1;
  return {
    id: `raw-item-${fakeRawItemCounter}`,
    source_id: 'source-default',
    raw_text: 'No supported claim appears here.',
    headline: 'Test headline',
    origin_type: SEARCH_DISCOVERED_ORIGIN_TYPE,
    content_shape: PROSE_CONTENT_SHAPE,
    processed: false,
    created_at: new Date(2024, 0, fakeRawItemCounter).toISOString(),
    ...overrides,
  };
}

function makeSource(overrides: Partial<FakeSourceRow> = {}): FakeSourceRow {
  return {
    id: 'source-default',
    discovery_tier: ESTABLISHED_DISCOVERY_TIER,
    ...overrides,
  };
}

function makeClaim(overrides: Partial<FakeClaimRow> = {}): FakeClaimRow {
  fakeClaimCounter += 1;
  return {
    id: `claim-${fakeClaimCounter}`,
    raw_item_id: `raw-item-for-claim-${fakeClaimCounter}`,
    claim_type: CASUALTY_COUNT_CLAIM_TYPE,
    value: { count: 15, group: 'palestinian', subtype: 'total' },
    raw_quote: `${fakeClaimCounter} people were killed in Rafah.`,
    date_occurred: '2024-05-01',
    location: 'Rafah',
    is_unverified_signal: false,
    created_at: new Date(2024, 0, fakeClaimCounter).toISOString(),
    lat: null,
    lng: null,
    geo_confidence: null,
    ...overrides,
  };
}

function makeSnapshotDb(
  inputs: Array<{
    claimId: string;
    rawItemId: string;
    sourceId: string;
    tier?: string | null;
    originType?: string;
    count: number;
    group?: string;
    subtype?: string | null;
    date?: string;
  }>,
): FakeSupabaseClient {
  const rawItems = inputs.map((input) =>
    makeRawItem({
      id: input.rawItemId,
      source_id: input.sourceId,
      origin_type: input.originType ?? SEARCH_DISCOVERED_ORIGIN_TYPE,
    }),
  );
  const claims = inputs.map((input) =>
    makeClaim({
      id: input.claimId,
      raw_item_id: input.rawItemId,
      value: {
        count: input.count,
        group: input.group ?? 'palestinian',
        subtype: input.subtype ?? 'total',
      },
      date_occurred: input.date ?? '2024-05-01',
    }),
  );
  const sources = [
    ...new Map(
      inputs.map((input) => [
        input.sourceId,
        makeSource({
          id: input.sourceId,
          discovery_tier: input.tier ?? ESTABLISHED_DISCOVERY_TIER,
        }),
      ]),
    ).values(),
  ];

  return new FakeSupabaseClient(rawItems, claims, sources);
}

class FakeSupabaseQuery {
  private filters: FakeFilter[] = [];
  private inFilters: { column: string; values: unknown[] }[] = [];
  private notEqFilters: FakeFilter[] = [];
  private updateValues: Record<string, unknown> = {};
  private limitCount = Number.POSITIVE_INFINITY;
  private deleteRequested = false;

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

  neq(column: string, value: unknown): this | FakeQueryResult<null> {
    this.notEqFilters.push({ column, value });
    if (this.deleteRequested) {
      return this.executeDelete();
    }
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.inFilters.push({ column, values });
    return this;
  }

  order(_column: string, _options: { ascending: boolean }): this {
    return this;
  }

  limit(count: number): FakeQueryResult<unknown[]> {
    this.limitCount = count;
    return this.executeSelect();
  }

  then<TResult1 = { data: unknown[] | null; error: Error | null }, TResult2 = never>(
    onfulfilled?:
      ((value: { data: unknown[] | null; error: Error | null }) => TResult1) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.executeSelect().then(onfulfilled, onrejected);
  }

  insert(
    rows: FakeClaimInsert[] | FakeCounterSnapshotInsert[] | Partial<FakeEventRow>,
  ): FakeQueryResult<null> {
    if (this.table === 'claims' && Array.isArray(rows)) {
      const claimRows = rows as FakeClaimInsert[];
      this.db.claims.push(
        ...claimRows.map((row) => ({
          id: `inserted-claim-${this.db.claims.length + 1}`,
          created_at: new Date().toISOString(),
          lat: null,
          lng: null,
          geo_confidence: null,
          ...row,
        })),
      );
      return Promise.resolve({ data: null, error: null });
    }

    if (this.table === 'counter_snapshots' && Array.isArray(rows)) {
      const snapshotRows = rows as FakeCounterSnapshotInsert[];
      this.db.counterSnapshots.push(
        ...snapshotRows.map((row) => {
          fakeSnapshotCounter += 1;
          return {
            id: `snapshot-${fakeSnapshotCounter}`,
            computed_at: new Date().toISOString(),
            ...row,
          };
        }),
      );
      return Promise.resolve({ data: null, error: null });
    }

    if (this.table === 'events' && !Array.isArray(rows)) {
      this.db.events.push({
        id: rows.id ?? `event-${this.db.events.length + 1}`,
        title: rows.title ?? null,
        neutral_summary: rows.neutral_summary ?? null,
        location: rows.location ?? null,
        lat: rows.lat ?? null,
        lng: rows.lng ?? null,
        category: rows.category ?? null,
        event_date: rows.event_date ?? null,
        framing_notes: rows.framing_notes ?? null,
        has_disagreement: rows.has_disagreement ?? false,
        disagreement_note: rows.disagreement_note ?? null,
        first_seen_at: rows.first_seen_at ?? new Date().toISOString(),
        last_updated_at: rows.last_updated_at ?? new Date().toISOString(),
      });
      return Promise.resolve({ data: null, error: null });
    }

    return Promise.resolve({
      data: null,
      error: new Error(`Unexpected insert into ${this.table}`),
    });
  }

  upsert(
    rows: FakeEventClaimRow[],
    _options: { onConflict: string },
  ): FakeQueryResult<null> {
    if (this.table !== 'event_claims') {
      return Promise.resolve({
        data: null,
        error: new Error(`Unexpected upsert into ${this.table}`),
      });
    }

    for (const row of rows) {
      const exists = this.db.eventClaims.some(
        (existing) =>
          existing.event_id === row.event_id && existing.claim_id === row.claim_id,
      );
      if (!exists) this.db.eventClaims.push({ ...row });
    }

    return Promise.resolve({ data: null, error: null });
  }

  delete(): this {
    this.deleteRequested = true;
    return this;
  }

  update(values: Record<string, unknown>): this {
    this.updateValues = values;
    return this;
  }

  private executeSelect(): FakeQueryResult<unknown[]> {
    const rows = this.tableRows();
    if (!rows) {
      return Promise.resolve({
        data: null,
        error: new Error(`Unexpected select from ${this.table}`),
      });
    }

    const filteredRows = rows
      .filter((row) => this.matchesEqFilters(row))
      .filter((row) => this.matchesNotEqFilters(row))
      .filter((row) => this.matchesInFilters(row))
      .slice(0, this.limitCount);

    return Promise.resolve({ data: filteredRows, error: null });
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

  private executeDelete(): FakeQueryResult<null> {
    if (this.table !== 'counter_snapshots') {
      return Promise.resolve({
        data: null,
        error: new Error(`Unexpected delete from ${this.table}`),
      });
    }

    this.db.counterSnapshots = this.db.counterSnapshots.filter(
      (row) =>
        !(
          this.matchesEqFilters(row) &&
          this.matchesNotEqFilters(row) &&
          this.matchesInFilters(row)
        ),
    );
    return Promise.resolve({ data: null, error: null });
  }

  private tableRows(): Record<string, unknown>[] | null {
    if (this.table === 'raw_items') return this.db.rawItems;
    if (this.table === 'claims') return this.db.claims;
    if (this.table === 'events') return this.db.events;
    if (this.table === 'event_claims') return this.db.eventClaims;
    if (this.table === 'sources') return this.db.sources;
    if (this.table === 'counter_snapshots') return this.db.counterSnapshots;
    return null;
  }

  private matchesEqFilters(row: Record<string, unknown>): boolean {
    return this.filters.every((filter) => row[filter.column] === filter.value);
  }

  private matchesNotEqFilters(row: Record<string, unknown>): boolean {
    return this.notEqFilters.every((filter) => row[filter.column] !== filter.value);
  }

  private matchesInFilters(row: Record<string, unknown>): boolean {
    return this.inFilters.every((filter) => filter.values.includes(row[filter.column]));
  }
}

class FakeSupabaseClient {
  claims: FakeClaimRow[] = [];
  events: FakeEventRow[] = [];
  eventClaims: FakeEventClaimRow[] = [];
  sources: FakeSourceRow[] = [];
  counterSnapshots: FakeCounterSnapshotRow[] = [];

  constructor(
    readonly rawItems: FakeRawItem[],
    claims: FakeClaimRow[] = [],
    sources: FakeSourceRow[] = [],
  ) {
    this.claims = claims;
    this.sources = sources;
  }

  from(table: string): FakeSupabaseQuery {
    return new FakeSupabaseQuery(this, table);
  }

  asExtractionDb(): RunExtractionOptions['db'] {
    return this as unknown as RunExtractionOptions['db'];
  }

  asDisagreementDb(): RunDisagreementDetectionOptions['db'] {
    return this as unknown as RunDisagreementDetectionOptions['db'];
  }

  asSnapshotsDb(): ComputeSnapshotsOptions['db'] {
    return this as unknown as ComputeSnapshotsOptions['db'];
  }

  asClusterDb(): RunClusteringOptions['db'] {
    return this as unknown as RunClusteringOptions['db'];
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
  it('T2: disagreement flags event and never mutates claims', async () => {
    const claimA = makeClaim({
      id: 'claim-a',
      value: { count: 15, group: 'palestinian', subtype: 'total' },
      raw_quote:
        'Medical officials in Rafah said on Wednesday that 15 people were killed.',
    });
    const claimB = makeClaim({
      id: 'claim-b',
      value: { count: 20, group: 'palestinian', subtype: 'total' },
      raw_quote:
        'The health ministry said 20 people were killed in Rafah on Wednesday.',
    });
    const db = new FakeSupabaseClient([], [claimA, claimB]);
    const claimsBefore = JSON.stringify(db.claims);

    await runDisagreementDetection({ db: db.asDisagreementDb() });
    await runDisagreementDetection({ db: db.asDisagreementDb() });

    const disagreementEvents = db.events.filter((event) => event.has_disagreement);
    expect(disagreementEvents).toHaveLength(1);
    expect(disagreementEvents[0]).toMatchObject({
      category: CASUALTY_EVENT_CATEGORY,
      event_date: '2024-05-01',
      location: 'Rafah',
      has_disagreement: true,
    });
    expect(disagreementEvents[0]?.disagreement_note).toContain('15');
    expect(disagreementEvents[0]?.disagreement_note).toContain('20');

    const linkedClaimIds = db.eventClaims
      .filter((link) => link.event_id === disagreementEvents[0]?.id)
      .map((link) => link.claim_id)
      .sort();
    expect(linkedClaimIds).toEqual(['claim-a', 'claim-b']);
    expect(db.eventClaims).toHaveLength(2);
    expect(JSON.stringify(db.claims)).toBe(claimsBefore);
  });

  // T3: two agreeing claims -> no disagreement flag.
  it('T3: agreeing claims produce no disagreement flag', async () => {
    const claimA = makeClaim({
      id: 'agreeing-claim-a',
      value: { count: 15, group: 'palestinian', subtype: 'total' },
    });
    const claimB = makeClaim({
      id: 'agreeing-claim-b',
      value: { count: 15, group: 'palestinian', subtype: 'total' },
    });
    const db = new FakeSupabaseClient([], [claimA, claimB]);
    const claimsBefore = JSON.stringify(db.claims);

    await runDisagreementDetection({ db: db.asDisagreementDb() });

    expect(db.events.filter((event) => event.has_disagreement)).toHaveLength(0);
    expect(db.eventClaims).toHaveLength(0);
    expect(JSON.stringify(db.claims)).toBe(claimsBefore);
  });

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
  it('T5: clustering groups same-event claims', async () => {
    const claimA = makeClaim({
      id: 'cluster-claim-a',
      raw_item_id: 'cluster-raw-item-a',
      raw_quote: 'Officials said 15 people were killed in Rafah.',
      value: { count: 15, group: 'palestinian', subtype: 'total' },
    });
    const claimB = makeClaim({
      id: 'cluster-claim-b',
      raw_item_id: 'cluster-raw-item-b',
      raw_quote: 'Health officials reported 20 people were killed in Rafah.',
      value: { count: 20, group: 'palestinian', subtype: 'total' },
    });
    const db = new FakeSupabaseClient(
      [
        makeRawItem({
          id: 'cluster-raw-item-a',
          source_id: 'source-a',
          headline: 'Rafah casualties reported after strikes',
        }),
        makeRawItem({
          id: 'cluster-raw-item-b',
          source_id: 'source-b',
          headline: 'Rafah casualties reported after airstrikes',
        }),
      ],
      [claimA, claimB],
    );
    const embedder = vi.fn<ClusterEmbedder>().mockResolvedValueOnce([
      [1, 0, 0],
      [0.999, 0.001, 0],
    ]);

    await runClustering({ db: db.asClusterDb(), embedder });

    expect(embedder).toHaveBeenCalledTimes(1);
    expect(db.events).toHaveLength(1);
    expect(db.eventClaims).toHaveLength(2);
    expect(db.events[0]).toMatchObject({
      category: CASUALTY_EVENT_CATEGORY,
      event_date: '2024-05-01',
      location: 'Rafah',
      has_disagreement: false,
      disagreement_note: null,
    });
    const linked = db.eventClaims
      .map((row) => row.claim_id)
      .sort((a, b) => a.localeCompare(b));
    expect(linked).toEqual(['cluster-claim-a', 'cluster-claim-b']);
  });

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

  it('clustering does not duplicate or mutate an existing disagreement event', async () => {
    const claimA = makeClaim({
      id: 'disagree-cluster-a',
      raw_item_id: 'disagree-raw-a',
      raw_quote: 'Medical officials said 15 people were killed in Rafah.',
      value: { count: 15, group: 'palestinian', subtype: 'total' },
    });
    const claimB = makeClaim({
      id: 'disagree-cluster-b',
      raw_item_id: 'disagree-raw-b',
      raw_quote: 'The health ministry said 20 people were killed in Rafah.',
      value: { count: 20, group: 'palestinian', subtype: 'total' },
    });
    const db = new FakeSupabaseClient(
      [
        makeRawItem({
          id: 'disagree-raw-a',
          headline: 'Rafah deaths reported by officials',
        }),
        makeRawItem({
          id: 'disagree-raw-b',
          headline: 'Rafah death toll rises',
        }),
      ],
      [claimA, claimB],
    );
    db.events = [
      {
        id: 'existing-disagreement-event',
        title: null,
        neutral_summary: null,
        location: 'Rafah',
        lat: null,
        lng: null,
        category: CASUALTY_EVENT_CATEGORY,
        event_date: '2024-05-01',
        framing_notes: null,
        has_disagreement: true,
        disagreement_note: 'Source A reports 15; Source B reports 20.',
        first_seen_at: '2024-05-01T00:00:00Z',
        last_updated_at: '2024-05-01T00:00:00Z',
      },
    ];
    db.eventClaims = [
      { event_id: 'existing-disagreement-event', claim_id: 'disagree-cluster-a' },
      { event_id: 'existing-disagreement-event', claim_id: 'disagree-cluster-b' },
    ];
    const eventsBefore = JSON.stringify(db.events);
    const embedder = vi.fn<ClusterEmbedder>().mockResolvedValueOnce([
      [1, 0, 0],
      [1, 0, 0],
    ]);

    await runClustering({ db: db.asClusterDb(), embedder });

    expect(embedder).not.toHaveBeenCalled();
    expect(db.events).toHaveLength(1);
    expect(db.eventClaims).toHaveLength(2);
    expect(JSON.stringify(db.events)).toBe(eventsBefore);
    expect(db.events[0]?.has_disagreement).toBe(true);
  });

  it('clustering is idempotent across repeated runs', async () => {
    const claimA = makeClaim({
      id: 'idempotent-cluster-a',
      raw_item_id: 'idempotent-raw-a',
    });
    const claimB = makeClaim({
      id: 'idempotent-cluster-b',
      raw_item_id: 'idempotent-raw-b',
      value: { count: 20, group: 'palestinian', subtype: 'total' },
    });
    const db = new FakeSupabaseClient(
      [
        makeRawItem({
          id: 'idempotent-raw-a',
          headline: 'Rafah casualties in latest update',
        }),
        makeRawItem({
          id: 'idempotent-raw-b',
          headline: 'Latest Rafah casualty update',
        }),
      ],
      [claimA, claimB],
    );
    const embedder = vi
      .fn<ClusterEmbedder>()
      .mockResolvedValueOnce([
        [0.9, 0.1, 0],
        [0.89, 0.11, 0],
      ])
      .mockResolvedValueOnce([
        [0.9, 0.1, 0],
        [0.89, 0.11, 0],
      ]);

    await runClustering({ db: db.asClusterDb(), embedder, similarityThreshold: 0.8 });
    await runClustering({ db: db.asClusterDb(), embedder, similarityThreshold: 0.8 });

    expect(db.events).toHaveLength(1);
    expect(db.eventClaims).toHaveLength(2);
    const links = db.eventClaims
      .map((row) => `${row.event_id}:${row.claim_id}`)
      .sort((a, b) => a.localeCompare(b));
    expect(new Set(links).size).toBe(2);
    expect(embedder).toHaveBeenCalledTimes(1);
  });
});

describe('pipeline — snapshots', () => {
  it('excludes emerging_unverified claims from counters', async () => {
    const db = makeSnapshotDb([
      {
        claimId: 'trusted-claim',
        rawItemId: 'trusted-raw-item',
        sourceId: 'trusted-source',
        count: 15,
      },
      {
        claimId: 'untrusted-claim',
        rawItemId: 'untrusted-raw-item',
        sourceId: 'untrusted-source',
        tier: EMERGING_UNVERIFIED_DISCOVERY_TIER,
        count: 500,
      },
    ]);

    await computeSnapshots({ db: db.asSnapshotsDb() });

    expect(db.counterSnapshots).toHaveLength(1);
    expect(db.counterSnapshots[0]).toMatchObject({
      counter_key: PALESTINIANS_KILLED_COUNTER,
      as_of_date: '2024-05-01',
      low_value: 15,
      high_value: 15,
      claim_count: 1,
      primary_source_ids: ['trusted-source'],
    });
    expect(JSON.stringify(db.counterSnapshots)).not.toContain('500');
    expect(db.counterSnapshots[0]?.primary_source_ids).not.toContain(
      'untrusted-source',
    );
  });

  it('stores a low/high range when countable sources disagree', async () => {
    const db = makeSnapshotDb([
      {
        claimId: 'claim-15',
        rawItemId: 'raw-item-15',
        sourceId: 'source-15',
        count: 15,
      },
      {
        claimId: 'claim-20',
        rawItemId: 'raw-item-20',
        sourceId: 'source-20',
        count: 20,
      },
    ]);

    await computeSnapshots({ db: db.asSnapshotsDb() });

    expect(db.counterSnapshots).toHaveLength(1);
    expect(db.counterSnapshots[0]).toMatchObject({
      counter_key: PALESTINIANS_KILLED_COUNTER,
      as_of_date: '2024-05-01',
      low_value: 15,
      high_value: 20,
      claim_count: 2,
      primary_source_ids: ['source-15', 'source-20'],
    });
  });

  it('stores equal low/high values when countable sources agree', async () => {
    const db = makeSnapshotDb([
      {
        claimId: 'agreeing-claim-1',
        rawItemId: 'agreeing-raw-item-1',
        sourceId: 'agreeing-source-1',
        count: 15,
      },
      {
        claimId: 'agreeing-claim-2',
        rawItemId: 'agreeing-raw-item-2',
        sourceId: 'agreeing-source-2',
        count: 15,
      },
    ]);

    await computeSnapshots({ db: db.asSnapshotsDb() });

    expect(db.counterSnapshots).toHaveLength(1);
    expect(db.counterSnapshots[0]).toMatchObject({
      counter_key: PALESTINIANS_KILLED_COUNTER,
      low_value: 15,
      high_value: 15,
      claim_count: 2,
    });
  });

  it('maps child casualty claims to children_killed', async () => {
    const db = makeSnapshotDb([
      {
        claimId: 'child-claim',
        rawItemId: 'child-raw-item',
        sourceId: 'child-source',
        count: 4,
        subtype: 'child',
      },
    ]);

    await computeSnapshots({ db: db.asSnapshotsDb() });

    expect(db.counterSnapshots).toHaveLength(1);
    expect(db.counterSnapshots[0]).toMatchObject({
      counter_key: CHILDREN_KILLED_COUNTER,
      low_value: 4,
      high_value: 4,
      claim_count: 1,
    });
    expect(
      db.counterSnapshots.some(
        (snapshot) => snapshot.counter_key === PALESTINIANS_KILLED_COUNTER,
      ),
    ).toBe(false);
  });

  it('rewrites snapshots idempotently instead of accumulating duplicates', async () => {
    const db = makeSnapshotDb([
      {
        claimId: 'idempotent-claim-15',
        rawItemId: 'idempotent-raw-item-15',
        sourceId: 'idempotent-source-15',
        count: 15,
      },
      {
        claimId: 'idempotent-claim-20',
        rawItemId: 'idempotent-raw-item-20',
        sourceId: 'idempotent-source-20',
        count: 20,
      },
    ]);

    await computeSnapshots({ db: db.asSnapshotsDb() });
    const firstRun = db.counterSnapshots.map(
      ({ id: _id, computed_at: _computedAt, ...snapshot }) => snapshot,
    );
    await computeSnapshots({ db: db.asSnapshotsDb() });
    const secondRun = db.counterSnapshots.map(
      ({ id: _id, computed_at: _computedAt, ...snapshot }) => snapshot,
    );

    expect(db.counterSnapshots).toHaveLength(1);
    expect(secondRun).toEqual(firstRun);
  });
});
