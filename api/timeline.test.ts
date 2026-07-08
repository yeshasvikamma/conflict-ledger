import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { getTimeline, setTimelineDbForTest } from './timeline.ts';

type FakeEventRow = {
  id: string;
  title: string | null;
  event_date: string | null;
  category: string | null;
  lat: number | null;
  lng: number | null;
  neutral_summary: string | null;
  has_disagreement: boolean;
};

type FakeEventClaimRow = {
  event_id: string;
  claim_id: string;
};

type FakeClaimRow = {
  id: string;
  raw_item_id: string;
};

type FakeRawItemRow = {
  id: string;
  source_id: string;
};

type FakeFilter = { column: string; value: unknown };

type FakeQueryResult<T> = Promise<{ data: T | null; error: Error | null }>;

type JsonResponse = {
  statusCode: number;
  body: unknown;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
};

class FakeSupabaseQuery {
  private eqFilters: FakeFilter[] = [];
  private gteFilters: FakeFilter[] = [];
  private lteFilters: FakeFilter[] = [];
  private inFilters: { column: string; values: unknown[] }[] = [];
  private orderColumn: string | null = null;
  private orderAscending = true;

  constructor(
    private readonly db: FakeSupabaseClient,
    private readonly table: string,
  ) {}

  select(_columns: string): this {
    return this;
  }

  eq(column: string, value: unknown): this {
    this.eqFilters.push({ column, value });
    return this;
  }

  gte(column: string, value: unknown): this {
    this.gteFilters.push({ column, value });
    return this;
  }

  lte(column: string, value: unknown): this {
    this.lteFilters.push({ column, value });
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.inFilters.push({ column, values });
    return this;
  }

  order(column: string, options: { ascending: boolean }): this {
    this.orderColumn = column;
    this.orderAscending = options.ascending;
    return this;
  }

  then<TResult1 = { data: unknown[] | null; error: Error | null }, TResult2 = never>(
    onfulfilled?:
      ((value: { data: unknown[] | null; error: Error | null }) => TResult1) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.executeSelect().then(onfulfilled, onrejected);
  }

  private executeSelect(): FakeQueryResult<unknown[]> {
    const rows = this.tableRows();
    if (!rows) {
      return Promise.resolve({
        data: null,
        error: new Error(`Unexpected select from ${this.table}`),
      });
    }

    let filtered = rows
      .filter((row) => this.eqFilters.every((f) => row[f.column] === f.value))
      .filter((row) =>
        this.gteFilters.every((f) => (row[f.column] as string) >= (f.value as string)),
      )
      .filter((row) =>
        this.lteFilters.every((f) => (row[f.column] as string) <= (f.value as string)),
      )
      .filter((row) => this.inFilters.every((f) => f.values.includes(row[f.column])));

    if (this.orderColumn) {
      const column = this.orderColumn;
      const dir = this.orderAscending ? 1 : -1;
      filtered = [...filtered].sort((a, b) => {
        const av = a[column] as string | null;
        const bv = b[column] as string | null;
        if (av === bv) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return av < bv ? -dir : dir;
      });
    }

    return Promise.resolve({ data: filtered, error: null });
  }

  private tableRows(): Record<string, unknown>[] | null {
    if (this.table === 'events') return this.db.events;
    if (this.table === 'event_claims') return this.db.eventClaims;
    if (this.table === 'claims') return this.db.claims;
    if (this.table === 'raw_items') return this.db.rawItems;
    return null;
  }
}

class FakeSupabaseClient {
  constructor(
    readonly events: FakeEventRow[] = [],
    readonly eventClaims: FakeEventClaimRow[] = [],
    readonly claims: FakeClaimRow[] = [],
    readonly rawItems: FakeRawItemRow[] = [],
  ) {}

  from(table: string): FakeSupabaseQuery {
    return new FakeSupabaseQuery(this, table);
  }
}

function makeResponse(): JsonResponse {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      res.body = body;
      return res;
    }),
  };
  return res;
}

function setFakeDb(db: FakeSupabaseClient): void {
  setTimelineDbForTest(db as unknown as Parameters<typeof setTimelineDbForTest>[0]);
}

function makeRequest(query: Record<string, string> = {}): Request {
  return { query } as unknown as Request;
}

afterEach(() => {
  setTimelineDbForTest(null);
});

const RAFAH_EVENT: FakeEventRow = {
  id: 'event-rafah',
  title: 'Rafah casualty toll disputed',
  event_date: '2024-05-01',
  category: 'casualty',
  lat: 31.3,
  lng: 34.25,
  neutral_summary: 'Outlets report differing casualty counts for strikes on Rafah.',
  has_disagreement: true,
};

const OTHER_EVENT: FakeEventRow = {
  id: 'event-other',
  title: 'Journalist killed near Rafah',
  event_date: '2024-04-20',
  category: 'journalist',
  lat: 31.29,
  lng: 34.24,
  neutral_summary: 'A journalist was killed while reporting near Rafah.',
  has_disagreement: false,
};

describe('GET /timeline', () => {
  it('returns events ordered by event_date with correct claim_count and distinct source_count', async () => {
    setFakeDb(
      new FakeSupabaseClient(
        [RAFAH_EVENT, OTHER_EVENT],
        [
          { event_id: 'event-rafah', claim_id: 'claim-15' },
          { event_id: 'event-rafah', claim_id: 'claim-20' },
          { event_id: 'event-other', claim_id: 'claim-journalist' },
        ],
        [
          { id: 'claim-15', raw_item_id: 'raw-reuters-casualty' },
          { id: 'claim-20', raw_item_id: 'raw-aljazeera-casualty' },
          { id: 'claim-journalist', raw_item_id: 'raw-reuters-journalist' },
        ],
        [
          { id: 'raw-reuters-casualty', source_id: 'source-reuters' },
          { id: 'raw-aljazeera-casualty', source_id: 'source-aljazeera' },
          { id: 'raw-reuters-journalist', source_id: 'source-reuters' },
        ],
      ),
    );
    const res = makeResponse();

    await getTimeline(makeRequest(), res as unknown as Response);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([
      {
        event_id: 'event-other',
        title: 'Journalist killed near Rafah',
        event_date: '2024-04-20',
        category: 'journalist',
        lat: 31.29,
        lng: 34.24,
        neutral_summary: 'A journalist was killed while reporting near Rafah.',
        claim_count: 1,
        source_count: 1,
        has_disagreement: false,
      },
      {
        event_id: 'event-rafah',
        title: 'Rafah casualty toll disputed',
        event_date: '2024-05-01',
        category: 'casualty',
        lat: 31.3,
        lng: 34.25,
        neutral_summary:
          'Outlets report differing casualty counts for strikes on Rafah.',
        claim_count: 2,
        source_count: 2,
        has_disagreement: true,
      },
    ]);
  });

  it('filters by category', async () => {
    setFakeDb(new FakeSupabaseClient([RAFAH_EVENT, OTHER_EVENT], [], [], []));
    const res = makeResponse();

    await getTimeline(
      makeRequest({ category: 'journalist' }),
      res as unknown as Response,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([
      expect.objectContaining({ event_id: 'event-other', category: 'journalist' }),
    ]);
  });

  it('filters by from/to date range', async () => {
    setFakeDb(new FakeSupabaseClient([RAFAH_EVENT, OTHER_EVENT], [], [], []));
    const res = makeResponse();

    await getTimeline(
      makeRequest({ from: '2024-04-25', to: '2024-05-31' }),
      res as unknown as Response,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([expect.objectContaining({ event_id: 'event-rafah' })]);
  });

  it('returns an empty array when there are no events', async () => {
    setFakeDb(new FakeSupabaseClient([], [], [], []));
    const res = makeResponse();

    await getTimeline(makeRequest(), res as unknown as Response);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });
});
