import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { getCounterBreakdown, getCounters, setCountersDbForTest } from './counters.ts';
import { CLAIM_TYPES, DISCOVERY_TIER, ORIGIN_TYPE } from '../shared/constants.ts';
import type { Json } from '../shared/types.ts';

const [, CASUALTY_COUNT_CLAIM_TYPE] = CLAIM_TYPES;
const [, , ESTABLISHED_DISCOVERY_TIER, EMERGING_UNVERIFIED_DISCOVERY_TIER] =
  DISCOVERY_TIER;
const [SEARCH_DISCOVERED_ORIGIN_TYPE, , X_ORIGIN_TYPE] = ORIGIN_TYPE;

const JOURNALISTS_KILLED_COUNTER = 'journalists_killed';
const PALESTINIANS_KILLED_COUNTER = 'palestinians_killed';

type FakeCounterSnapshotRow = {
  counter_key: string;
  low_value: number | null;
  high_value: number | null;
  as_of_date: string;
  primary_source_ids: string[] | null;
  claim_count: number | null;
  computed_at: string;
};

type FakeClaimRow = {
  id: string;
  raw_item_id: string;
  claim_type: string;
  value: Json;
  raw_quote: string;
  date_occurred: string | null;
};

type FakeRawItemRow = {
  id: string;
  source_id: string;
  origin_type: string;
  url: string;
};

type FakeSourceRow = {
  id: string;
  name: string | null;
  domain: string;
  discovery_tier: string | null;
};

type FakeQueryResult<T> = Promise<{ data: T | null; error: Error | null }>;

type JsonResponse = {
  statusCode: number;
  body: unknown;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
};

class FakeSupabaseQuery {
  private inFilters: { column: string; values: unknown[] }[] = [];

  constructor(
    private readonly db: FakeSupabaseClient,
    private readonly table: string,
  ) {}

  select(_columns: string): this {
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.inFilters.push({ column, values });
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

    return Promise.resolve({
      data: rows.filter((row) =>
        this.inFilters.every((filter) => filter.values.includes(row[filter.column])),
      ),
      error: null,
    });
  }

  private tableRows(): Record<string, unknown>[] | null {
    if (this.table === 'counter_snapshots') return this.db.counterSnapshots;
    if (this.table === 'claims') return this.db.claims;
    if (this.table === 'raw_items') return this.db.rawItems;
    if (this.table === 'sources') return this.db.sources;
    return null;
  }
}

class FakeSupabaseClient {
  constructor(
    readonly counterSnapshots: FakeCounterSnapshotRow[] = [],
    readonly claims: FakeClaimRow[] = [],
    readonly rawItems: FakeRawItemRow[] = [],
    readonly sources: FakeSourceRow[] = [],
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
  setCountersDbForTest(db as unknown as Parameters<typeof setCountersDbForTest>[0]);
}

afterEach(() => {
  setCountersDbForTest(null);
});

describe('counter API handlers', () => {
  it('getCounters returns the latest snapshot per counter_key', async () => {
    setFakeDb(
      new FakeSupabaseClient([
        {
          counter_key: PALESTINIANS_KILLED_COUNTER,
          low_value: 10,
          high_value: 10,
          as_of_date: '2024-05-01',
          primary_source_ids: ['source-old'],
          claim_count: 1,
          computed_at: '2024-05-02T00:00:00Z',
        },
        {
          counter_key: PALESTINIANS_KILLED_COUNTER,
          low_value: 15,
          high_value: 20,
          as_of_date: '2024-05-03',
          primary_source_ids: ['source-new-a', 'source-new-b'],
          claim_count: 2,
          computed_at: '2024-05-04T00:00:00Z',
        },
        {
          counter_key: JOURNALISTS_KILLED_COUNTER,
          low_value: 3,
          high_value: 3,
          as_of_date: '2024-05-02',
          primary_source_ids: ['source-journalist'],
          claim_count: 1,
          computed_at: '2024-05-03T00:00:00Z',
        },
      ]),
    );
    const res = makeResponse();

    await getCounters({} as Request, res as unknown as Response);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([
      {
        counter_key: JOURNALISTS_KILLED_COUNTER,
        low_value: 3,
        high_value: 3,
        as_of_date: '2024-05-02',
        primary_source_ids: ['source-journalist'],
        claim_count: 1,
      },
      {
        counter_key: PALESTINIANS_KILLED_COUNTER,
        low_value: 15,
        high_value: 20,
        as_of_date: '2024-05-03',
        primary_source_ids: ['source-new-a', 'source-new-b'],
        claim_count: 2,
      },
    ]);
  });

  it('getCounterBreakdown returns trusted sourced claims and excludes gated rows', async () => {
    setFakeDb(
      new FakeSupabaseClient(
        [],
        [
          {
            id: 'trusted-claim',
            raw_item_id: 'trusted-raw-item',
            claim_type: CASUALTY_COUNT_CLAIM_TYPE,
            value: { count: 15, group: 'palestinian', subtype: 'total' },
            raw_quote: 'Medical officials said 15 people were killed.',
            date_occurred: '2024-05-01',
          },
          {
            id: 'untrusted-claim',
            raw_item_id: 'untrusted-raw-item',
            claim_type: CASUALTY_COUNT_CLAIM_TYPE,
            value: { count: 500, group: 'palestinian', subtype: 'total' },
            raw_quote: 'A blog claimed 500 people were killed.',
            date_occurred: '2024-05-01',
          },
          {
            id: 'x-claim',
            raw_item_id: 'x-raw-item',
            claim_type: CASUALTY_COUNT_CLAIM_TYPE,
            value: { count: 999, group: 'palestinian', subtype: 'total' },
            raw_quote: 'An X post claimed 999 people were killed.',
            date_occurred: '2024-05-01',
          },
        ],
        [
          {
            id: 'trusted-raw-item',
            source_id: 'trusted-source',
            origin_type: SEARCH_DISCOVERED_ORIGIN_TYPE,
            url: 'https://trusted.example/story',
          },
          {
            id: 'untrusted-raw-item',
            source_id: 'untrusted-source',
            origin_type: SEARCH_DISCOVERED_ORIGIN_TYPE,
            url: 'https://untrusted.example/story',
          },
          {
            id: 'x-raw-item',
            source_id: 'trusted-source',
            origin_type: X_ORIGIN_TYPE,
            url: 'https://x.example/post',
          },
        ],
        [
          {
            id: 'trusted-source',
            name: 'Trusted Source',
            domain: 'trusted.example',
            discovery_tier: ESTABLISHED_DISCOVERY_TIER,
          },
          {
            id: 'untrusted-source',
            name: 'Untrusted Blog',
            domain: 'untrusted.example',
            discovery_tier: EMERGING_UNVERIFIED_DISCOVERY_TIER,
          },
        ],
      ),
    );
    const res = makeResponse();

    await getCounterBreakdown(
      { params: { key: PALESTINIANS_KILLED_COUNTER } } as unknown as Request,
      res as unknown as Response,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      counter: PALESTINIANS_KILLED_COUNTER,
      claims: [
        {
          value: { count: 15, group: 'palestinian', subtype: 'total' },
          raw_quote: 'Medical officials said 15 people were killed.',
          source: {
            name: 'Trusted Source',
            tier: ESTABLISHED_DISCOVERY_TIER,
            domain: 'trusted.example',
          },
          url: 'https://trusted.example/story',
          date: '2024-05-01',
        },
      ],
    });
    expect(JSON.stringify(res.body)).not.toContain('500');
    expect(JSON.stringify(res.body)).not.toContain('999');
  });

  it('getCounterBreakdown returns an empty claims array for an unknown counter_key', async () => {
    setFakeDb(
      new FakeSupabaseClient(
        [],
        [
          {
            id: 'trusted-claim',
            raw_item_id: 'trusted-raw-item',
            claim_type: CASUALTY_COUNT_CLAIM_TYPE,
            value: { count: 15, group: 'palestinian', subtype: 'total' },
            raw_quote: 'Medical officials said 15 people were killed.',
            date_occurred: '2024-05-01',
          },
        ],
        [
          {
            id: 'trusted-raw-item',
            source_id: 'trusted-source',
            origin_type: SEARCH_DISCOVERED_ORIGIN_TYPE,
            url: 'https://trusted.example/story',
          },
        ],
        [
          {
            id: 'trusted-source',
            name: 'Trusted Source',
            domain: 'trusted.example',
            discovery_tier: ESTABLISHED_DISCOVERY_TIER,
          },
        ],
      ),
    );
    const res = makeResponse();

    await getCounterBreakdown(
      { params: { key: 'unknown_counter' } } as unknown as Request,
      res as unknown as Response,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ counter: 'unknown_counter', claims: [] });
  });
});
