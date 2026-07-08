import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { getEvent, setEventDbForTest } from './event.ts';
import { DISCOVERY_TIER } from '../shared/constants.ts';
import type { Json } from '../shared/types.ts';

const [, WIRE_SERVICE_TIER, ESTABLISHED_TIER] = DISCOVERY_TIER;

type FakeEventRow = {
  id: string;
  title: string | null;
  neutral_summary: string | null;
  category: string | null;
  event_date: string | null;
  location: string | null;
  has_disagreement: boolean;
  disagreement_note: string | null;
};

type FakeEventClaimRow = {
  event_id: string;
  claim_id: string;
};

type FakeClaimRow = {
  id: string;
  raw_item_id: string;
  value: Json;
  raw_quote: string;
  date_occurred: string | null;
};

type FakeRawItemRow = {
  id: string;
  source_id: string;
  url: string;
};

type FakeSourceRow = {
  id: string;
  name: string | null;
  domain: string;
  discovery_tier: string | null;
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
  private inFilters: { column: string; values: unknown[] }[] = [];

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

  in(column: string, values: unknown[]): this {
    this.inFilters.push({ column, values });
    return this;
  }

  limit(count: number): FakeQueryResult<unknown[]> {
    return this.executeSelect().then((result) => ({
      data: result.data ? result.data.slice(0, count) : result.data,
      error: result.error,
    }));
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

    const filtered = rows
      .filter((row) => this.eqFilters.every((f) => row[f.column] === f.value))
      .filter((row) => this.inFilters.every((f) => f.values.includes(row[f.column])));

    return Promise.resolve({ data: filtered, error: null });
  }

  private tableRows(): Record<string, unknown>[] | null {
    if (this.table === 'events') return this.db.events;
    if (this.table === 'event_claims') return this.db.eventClaims;
    if (this.table === 'claims') return this.db.claims;
    if (this.table === 'raw_items') return this.db.rawItems;
    if (this.table === 'sources') return this.db.sources;
    return null;
  }
}

class FakeSupabaseClient {
  constructor(
    readonly events: FakeEventRow[] = [],
    readonly eventClaims: FakeEventClaimRow[] = [],
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
  setEventDbForTest(db as unknown as Parameters<typeof setEventDbForTest>[0]);
}

function makeRequest(id: string): Request {
  return { params: { id } } as unknown as Request;
}

afterEach(() => {
  setEventDbForTest(null);
});

const RAFAH_EVENT: FakeEventRow = {
  id: 'event-rafah',
  title: 'Rafah casualty toll disputed',
  neutral_summary: 'Outlets report differing casualty counts for strikes on Rafah.',
  category: 'casualty',
  event_date: '2024-05-01',
  location: 'Rafah',
  has_disagreement: true,
  disagreement_note: 'Reuters reported 15 killed; Al Jazeera reported 20 killed.',
};

const RAFAH_SOURCES: FakeSourceRow[] = [
  {
    id: 'source-reuters',
    name: 'Reuters',
    domain: 'reuters.com',
    discovery_tier: WIRE_SERVICE_TIER,
  },
  {
    id: 'source-aljazeera',
    name: 'Al Jazeera',
    domain: 'aljazeera.com',
    discovery_tier: ESTABLISHED_TIER,
  },
];

const RAFAH_RAW_ITEMS: FakeRawItemRow[] = [
  {
    id: 'raw-reuters-casualty',
    source_id: 'source-reuters',
    url: 'https://reuters.com/world/seed-casualty-a',
  },
  {
    id: 'raw-aljazeera-casualty',
    source_id: 'source-aljazeera',
    url: 'https://aljazeera.com/news/seed-casualty-b',
  },
];

const RAFAH_CLAIMS: FakeClaimRow[] = [
  {
    id: 'claim-15',
    raw_item_id: 'raw-reuters-casualty',
    value: { count: 15, group: 'palestinian', subtype: 'total' },
    raw_quote:
      'Medical officials in Rafah said on Wednesday that 15 people were killed',
    date_occurred: '2024-05-01',
  },
  {
    id: 'claim-20',
    raw_item_id: 'raw-aljazeera-casualty',
    value: { count: 20, group: 'palestinian', subtype: 'total' },
    raw_quote: 'the health ministry said 20 people were killed in Rafah on Wednesday',
    date_occurred: '2024-05-01',
  },
];

const RAFAH_EVENT_CLAIMS: FakeEventClaimRow[] = [
  { event_id: 'event-rafah', claim_id: 'claim-15' },
  { event_id: 'event-rafah', claim_id: 'claim-20' },
];

describe('GET /event/:id', () => {
  it('returns the event with its claims, each carrying raw_quote + source', async () => {
    setFakeDb(
      new FakeSupabaseClient(
        [RAFAH_EVENT],
        RAFAH_EVENT_CLAIMS,
        RAFAH_CLAIMS,
        RAFAH_RAW_ITEMS,
        RAFAH_SOURCES,
      ),
    );
    const res = makeResponse();

    await getEvent(makeRequest('event-rafah'), res as unknown as Response);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      event: {
        id: 'event-rafah',
        title: 'Rafah casualty toll disputed',
        neutral_summary:
          'Outlets report differing casualty counts for strikes on Rafah.',
        category: 'casualty',
        event_date: '2024-05-01',
        location: 'Rafah',
        has_disagreement: true,
        disagreement_note: 'Reuters reported 15 killed; Al Jazeera reported 20 killed.',
      },
      claims: [
        {
          value: { count: 15, group: 'palestinian', subtype: 'total' },
          raw_quote:
            'Medical officials in Rafah said on Wednesday that 15 people were killed',
          date_occurred: '2024-05-01',
          source: { name: 'Reuters', tier: WIRE_SERVICE_TIER, domain: 'reuters.com' },
          url: 'https://reuters.com/world/seed-casualty-a',
        },
        {
          value: { count: 20, group: 'palestinian', subtype: 'total' },
          raw_quote:
            'the health ministry said 20 people were killed in Rafah on Wednesday',
          date_occurred: '2024-05-01',
          source: {
            name: 'Al Jazeera',
            tier: ESTABLISHED_TIER,
            domain: 'aljazeera.com',
          },
          url: 'https://aljazeera.com/news/seed-casualty-b',
        },
      ],
    });
  });

  it('returns the disagreement_note and both disagreeing claims (divergence view)', async () => {
    setFakeDb(
      new FakeSupabaseClient(
        [RAFAH_EVENT],
        RAFAH_EVENT_CLAIMS,
        RAFAH_CLAIMS,
        RAFAH_RAW_ITEMS,
        RAFAH_SOURCES,
      ),
    );
    const res = makeResponse();

    await getEvent(makeRequest('event-rafah'), res as unknown as Response);

    const body = res.body as {
      event: { has_disagreement: boolean; disagreement_note: string | null };
      claims: unknown[];
    };
    expect(body.event.has_disagreement).toBe(true);
    expect(body.event.disagreement_note).toContain('15');
    expect(body.event.disagreement_note).toContain('20');
    expect(body.claims).toHaveLength(2);
  });

  it('returns 404 for a nonexistent event id', async () => {
    setFakeDb(new FakeSupabaseClient([RAFAH_EVENT], [], [], [], []));
    const res = makeResponse();

    await getEvent(makeRequest('does-not-exist'), res as unknown as Response);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: expect.stringContaining('does-not-exist') });
  });
});
