// =============================================================================
// signal/signal.test.ts  [Person B]
// =============================================================================
// The two signal tests that define "done" (PRD §10). T2 is the important one:
// it's the actual guarantee that unverified social signal can never leak into a
// counted number.
// =============================================================================

import { describe, expect, it, vi } from 'vitest';
import { ORIGIN_TYPE } from '../shared/constants.ts';
import { runSignalOnce } from './run.ts';

const [SEARCH_DISCOVERED_ORIGIN, INSTITUTIONAL_DIRECT_ORIGIN, X_ORIGIN_TYPE] =
  ORIGIN_TYPE;

describe('signal', () => {
  it("T1: all Grok rows tagged origin_type='x'", async () => {
    const { db, rawItemUpserts } = mockSignalDb();
    const searcher = vi.fn(async () => [
      {
        url: 'https://x.com/reporter/status/1',
        author_handle: '@reporter',
        text: 'Gaza casualties today update',
        posted_at: '2026-07-08T12:00:00.000Z',
      },
      {
        url: 'https://x.com/witness/status/2',
        author_handle: '@witness',
        text: 'Breaking Gaza strike report',
        posted_at: null,
      },
    ]);

    await runSignalOnce(db, ['Gaza casualties today'], searcher);

    expect(rawItemUpserts).toHaveLength(2);
    expect(rawItemUpserts.every((row) => row.origin_type === X_ORIGIN_TYPE)).toBe(true);
    expect(
      rawItemUpserts.some((row) => row.origin_type === SEARCH_DISCOVERED_ORIGIN),
    ).toBe(false);
  });

  it('T2: countable-origin filter excludes all x-origin rows', async () => {
    const preSeededRawItems = [
      { id: 'raw-person-a', origin_type: SEARCH_DISCOVERED_ORIGIN },
      { id: 'raw-cpj', origin_type: INSTITUTIONAL_DIRECT_ORIGIN },
    ];
    const { db, rawItemUpserts } = mockSignalDb(preSeededRawItems);
    const searcher = vi.fn(async () => [
      {
        url: 'https://x.com/reporter/status/4',
        author_handle: '@reporter',
        text: 'Gaza hospital hit update',
        posted_at: '2026-07-08T13:00:00.000Z',
      },
      {
        url: 'https://x.com/witness/status/5',
        author_handle: '@witness',
        text: 'Aid convoy Gaza update',
        posted_at: '2026-07-08T13:05:00.000Z',
      },
    ]);

    await runSignalOnce(db, ['Gaza hospital hit'], searcher);

    expect(db).toBeDefined();

    const { data, error } = await db!
      .from('raw_items')
      .select('id, origin_type')
      .in('origin_type', [SEARCH_DISCOVERED_ORIGIN, INSTITUTIONAL_DIRECT_ORIGIN]);

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data).toEqual(preSeededRawItems);
    expect(rawItemUpserts).toHaveLength(2);
    expect(data!.some((row) => row.origin_type === X_ORIGIN_TYPE)).toBe(false);
    expect(
      data!.some((row) => rawItemUpserts.some((upsert) => upsert.id === row.id)),
    ).toBe(false);
  });

  it('T3: one failed Grok query does not stop later queries', async () => {
    const { db, rawItemUpserts } = mockSignalDb();
    const searcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary Grok failure'))
      .mockResolvedValueOnce([
        {
          url: 'https://x.com/reporter/status/3',
          author_handle: '@reporter',
          text: 'Gaza journalist killed update',
          posted_at: '2026-07-08T12:30:00.000Z',
        },
      ]);

    await runSignalOnce(
      db,
      ['breaking Gaza strike', 'Gaza journalist killed'],
      searcher,
    );

    expect(searcher).toHaveBeenCalledTimes(2);
    expect(rawItemUpserts).toHaveLength(1);
    expect(rawItemUpserts[0]?.url).toBe('https://x.com/reporter/status/3');
  });
});

type SourceInsert = {
  discovered_via: string;
  domain: string;
  name: string;
  source_type: string;
};

type RawItemUpsert = {
  headline: string;
  id: string;
  origin_type: string;
  published_at: string | null;
  raw_text: string;
  source_id: string;
  url: string;
};

function mockSignalDb(
  preSeededRawItems: Array<{ id: string; origin_type: string }> = [],
): {
  db: Parameters<typeof runSignalOnce>[0];
  rawItemUpserts: RawItemUpsert[];
} {
  const sources = new Map<string, { id: string; row: SourceInsert }>();
  const rawItemUpserts: RawItemUpsert[] = [];
  const rawItems = [...preSeededRawItems];

  const db = {
    from(table: string) {
      return {
        select(columns: string) {
          if (table === 'sources') {
            expect(columns).toBe('id');

            return {
              eq(column: string, value: string) {
                expect(column).toBe('domain');

                return {
                  limit(count: number) {
                    expect(count).toBe(1);
                    const existingSource = sources.get(value);

                    return Promise.resolve({
                      data: existingSource ? [{ id: existingSource.id }] : [],
                      error: null,
                    });
                  },
                };
              },
            };
          }

          if (table === 'raw_items') {
            if (columns === 'id') {
              return Promise.resolve({ data: [{ id: 'raw-item-id' }], error: null });
            }

            if (columns === 'id, origin_type') {
              return {
                in(column: string, values: string[]) {
                  expect(column).toBe('origin_type');
                  expect(values).toEqual([
                    SEARCH_DISCOVERED_ORIGIN,
                    INSTITUTIONAL_DIRECT_ORIGIN,
                  ]);

                  return Promise.resolve({
                    data: rawItems.filter((row) => values.includes(row.origin_type)),
                    error: null,
                  });
                },
              };
            }

            throw new Error(`unexpected raw_items select columns ${columns}`);
          }

          throw new Error(`unexpected select table ${table}`);
        },
        insert(payload: SourceInsert) {
          expect(table).toBe('sources');
          const id = `source-${sources.size + 1}`;

          return {
            select(columns: string) {
              expect(columns).toBe('id');

              return {
                single() {
                  sources.set(payload.domain, { id, row: payload });
                  return Promise.resolve({ data: { id }, error: null });
                },
              };
            },
          };
        },
        upsert(payload: RawItemUpsert) {
          expect(table).toBe('raw_items');
          const row = {
            ...payload,
            id: `raw-signal-${rawItemUpserts.length + 1}`,
          };
          rawItemUpserts.push(row);
          rawItems.push({
            id: row.id,
            origin_type: row.origin_type,
          });

          return {
            select(columns: string) {
              expect(columns).toBe('id');
              return Promise.resolve({ data: [{ id: 'raw-item-id' }], error: null });
            },
          };
        },
      };
    },
  } as unknown as Parameters<typeof runSignalOnce>[0];

  return { db, rawItemUpserts };
}
