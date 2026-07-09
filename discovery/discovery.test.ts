// =============================================================================
// discovery/discovery.test.ts  [Person A]
// =============================================================================
// The four tests that define "done" for the discovery track. They start as
// `.todo` so the suite is green on a fresh clone; convert each to a real
// `it(...)` as you implement. All four must be real and passing before this
// track is done (PRD section 9).
// =============================================================================

import { ORIGIN_TYPE } from '../shared/constants.ts';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { serviceClientMock } = vi.hoisted(() => ({
  serviceClientMock: vi.fn(),
}));

vi.mock('../shared/supabaseClient.ts', () => ({
  serviceClient: serviceClientMock,
}));

type SourceRecord = {
  id: string;
  domain: string;
  name: string | null;
  source_type: string;
  discovered_via: string;
  discovery_tier: string | null;
  tier_reason: string | null;
};

type RawItemRecord = {
  id: string;
  source_id: string;
  headline: string | null;
  raw_text: string;
  url: string;
  published_at: string | null;
  origin_type: string;
  content_shape: string;
  processed: boolean;
};

type SourceInsertPayload = {
  domain: string;
  name: string | null;
  discovered_via: string;
  source_type?: string;
};

type RawUpsertPayload = {
  source_id: string;
  headline: string | null;
  raw_text: string;
  url: string;
  published_at?: string | null;
  origin_type: string;
};

type UpsertCall = {
  payload: RawUpsertPayload;
  options: { onConflict?: string; ignoreDuplicates?: boolean } | undefined;
};

type FakeDbOptions = {
  conflictOnInsertDomain?: string;
  conflictSourceRow?: SourceRecord;
};

function createFakeDb(options: FakeDbOptions = {}) {
  const state: {
    sources: SourceRecord[];
    rawItems: RawItemRecord[];
    sourceInsertPayloads: SourceInsertPayload[];
    rawUpsertPayloads: RawUpsertPayload[];
    rawUpsertCalls: UpsertCall[];
    sourceSelectByDomainCalls: number;
    sourceInsertConflictCount: number;
  } = {
    sources: [],
    rawItems: [],
    sourceInsertPayloads: [],
    rawUpsertPayloads: [],
    rawUpsertCalls: [],
    sourceSelectByDomainCalls: 0,
    sourceInsertConflictCount: 0,
  };

  let sourceCounter = 0;
  let rawCounter = 0;

  const db = {
    from(table: 'sources' | 'raw_items') {
      if (table === 'sources') {
        return {
          select(_columns: 'id') {
            return {
              eq(_column: 'domain', domain: string) {
                return {
                  async maybeSingle() {
                    state.sourceSelectByDomainCalls += 1;
                    const existing = state.sources.find((s) => s.domain === domain);
                    return { data: existing ? { id: existing.id } : null, error: null };
                  },
                };
              },
            };
          },
          insert(payload: SourceInsertPayload) {
            state.sourceInsertPayloads.push(payload);
            return {
              select(_columns: 'id') {
                return {
                  async maybeSingle() {
                    if (
                      options.conflictOnInsertDomain === payload.domain &&
                      state.sourceInsertConflictCount === 0
                    ) {
                      state.sourceInsertConflictCount += 1;
                      if (
                        options.conflictSourceRow &&
                        !state.sources.some(
                          (s) => s.domain === options.conflictSourceRow!.domain,
                        )
                      ) {
                        state.sources.push(options.conflictSourceRow);
                      }
                      return {
                        data: null,
                        error: {
                          message: 'duplicate key value violates unique constraint',
                        },
                      };
                    }

                    const exists = state.sources.some(
                      (s) => s.domain === payload.domain,
                    );
                    if (exists) {
                      return {
                        data: null,
                        error: {
                          message: 'duplicate key value violates unique constraint',
                        },
                      };
                    }

                    const id = `source-${++sourceCounter}`;
                    state.sources.push({
                      id,
                      domain: payload.domain,
                      name: payload.name,
                      source_type: payload.source_type ?? 'news',
                      discovered_via: payload.discovered_via,
                      discovery_tier: null,
                      tier_reason: null,
                    });
                    return { data: { id }, error: null };
                  },
                };
              },
            };
          },
        };
      }

      return {
        async upsert(
          payload: RawUpsertPayload,
          options?: { onConflict?: string; ignoreDuplicates?: boolean },
        ) {
          state.rawUpsertPayloads.push(payload);
          state.rawUpsertCalls.push({ payload, options });

          const existing = state.rawItems.find((item) => item.url === payload.url);
          if (existing) {
            if (options?.ignoreDuplicates) {
              return { error: null };
            }

            existing.source_id = payload.source_id;
            existing.headline = payload.headline;
            existing.raw_text = payload.raw_text;
            existing.origin_type = payload.origin_type;
            return { error: null };
          }

          const id = `raw-${++rawCounter}`;
          state.rawItems.push({
            id,
            source_id: payload.source_id,
            headline: payload.headline,
            raw_text: payload.raw_text,
            url: payload.url,
            published_at: payload.published_at ?? null,
            origin_type: payload.origin_type,
            content_shape: 'unknown',
            processed: false,
          });
          return { error: null };
        },
      };
    },
  };

  return { db, state };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  serviceClientMock.mockReset();
});

describe('discovery', () => {
  it('importing run.ts is side-effect safe and runCycle is explicit', async () => {
    serviceClientMock.mockImplementation(() => {
      throw new Error('serviceClient should not be called on import');
    });

    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const runModule = await import('./run.ts');

    expect(serviceClientMock).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockClear();

    const deps: Parameters<typeof runModule.runCycle>[0] = {
      db: createFakeDb().db as unknown as Parameters<
        typeof runModule.runCycle
      >[0]['db'],
      serpSearch: vi.fn(async () => []),
      scrapeUrl: vi.fn(async () => ({ headline: null, raw_text: 'fake text' })),
      fetchCpj: vi.fn(async () => []),
      queries: { narrative: ['test query'], institutional: ['cpj query'] },
    };

    await runModule.runCycle(deps);

    expect(deps.serpSearch).toHaveBeenCalledTimes(2);
    expect(deps.scrapeUrl).not.toHaveBeenCalled();
    expect(deps.fetchCpj).toHaveBeenCalledTimes(1);
    expect(serviceClientMock).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('T1: does not insert duplicate raw_items for the same URL (upsert on url)', async () => {
    const runModule = await import('./run.ts');
    const { db, state } = createFakeDb();

    const query = 'journalist killed Gaza';
    const deps: Parameters<typeof runModule.runCycle>[0] = {
      db: db as unknown as Parameters<typeof runModule.runCycle>[0]['db'],
      serpSearch: vi.fn(async () => [
        { url: 'https://example.com/story-1', domain: 'example.com', title: 'Story' },
      ]),
      scrapeUrl: vi
        .fn()
        .mockResolvedValueOnce({ headline: 'H1', raw_text: 'first body text' })
        .mockResolvedValueOnce({ headline: 'H2', raw_text: 'second body text' }),
      fetchCpj: vi.fn(async () => []),
      queries: { narrative: [query], institutional: [] },
    };

    await runModule.runCycle(deps);
    expect(state.rawItems).toHaveLength(1);
    const initialRaw = state.rawItems[0]!;
    initialRaw.processed = true;
    initialRaw.content_shape = 'prose';

    await runModule.runCycle(deps);

    expect(state.sources).toHaveLength(1);
    expect(state.rawItems).toHaveLength(1);
    expect(state.rawUpsertCalls).toHaveLength(2);
    expect(state.rawUpsertCalls.every((c) => c.options?.onConflict === 'url')).toBe(
      true,
    );
    const dedupedRaw = state.rawItems[0]!;
    expect(dedupedRaw.raw_text).toBe('first body text');
    expect(dedupedRaw.processed).toBe(true);
    expect(dedupedRaw.content_shape).toBe('prose');
  });

  it('T2: new domain inserted with discovered_via = exact query, tier null', async () => {
    const runModule = await import('./run.ts');
    const { db, state } = createFakeDb();

    const query = '  official journalist casualty count Gaza  ';
    const deps: Parameters<typeof runModule.runCycle>[0] = {
      db: db as unknown as Parameters<typeof runModule.runCycle>[0]['db'],
      serpSearch: vi.fn(async () => [
        {
          url: 'https://freshdomain.example/report',
          domain: 'freshdomain.example',
          title: 'Report',
        },
      ]),
      scrapeUrl: vi.fn(async () => ({ headline: 'Report', raw_text: 'body text' })),
      fetchCpj: vi.fn(async () => []),
      queries: { narrative: [query], institutional: [] },
    };

    await runModule.runCycle(deps);

    expect(state.sources).toHaveLength(1);
    const source = state.sources[0]!;
    expect(source.domain).toBe('freshdomain.example');
    expect(source.discovered_via).toBe(query);
    expect(source.discovery_tier).toBeNull();
    expect(source.tier_reason).toBeNull();

    expect(state.sourceInsertPayloads).toHaveLength(1);
    expect(state.sourceInsertPayloads[0]).toEqual({
      domain: 'freshdomain.example',
      name: null,
      discovered_via: query,
    });

    expect(state.rawItems).toHaveLength(1);
    const raw = state.rawItems[0]!;
    expect(raw.source_id).toBe(source.id);
    expect(raw.url).toBe('https://freshdomain.example/report');
    expect(raw.headline).toBe('Report');
    expect(raw.raw_text).toBe('body text');
    expect(raw.origin_type).toBe(ORIGIN_TYPE[0]);

    expect(state.rawUpsertPayloads).toHaveLength(1);
    expect(state.rawUpsertPayloads[0]).toEqual({
      source_id: source.id,
      headline: 'Report',
      raw_text: 'body text',
      url: 'https://freshdomain.example/report',
      origin_type: ORIGIN_TYPE[0],
    });
    expect(state.rawUpsertCalls[0]!.options?.onConflict).toBe('url');
  });

  it('retries source lookup after unique-domain conflict and reuses existing source id', async () => {
    const runModule = await import('./run.ts');
    const conflictSource: SourceRecord = {
      id: 'source-race',
      domain: 'race.example',
      name: 'Race Source',
      source_type: 'news',
      discovered_via: 'first-seen-elsewhere',
      discovery_tier: 'established',
      tier_reason: 'owned-by-person-b',
    };
    const { db, state } = createFakeDb({
      conflictOnInsertDomain: 'race.example',
      conflictSourceRow: conflictSource,
    });

    const query = 'race condition query';
    const deps: Parameters<typeof runModule.runCycle>[0] = {
      db: db as unknown as Parameters<typeof runModule.runCycle>[0]['db'],
      serpSearch: vi.fn(async () => [
        { url: 'https://race.example/article', domain: 'race.example', title: 'Race' },
      ]),
      scrapeUrl: vi.fn(async () => ({ headline: 'Race', raw_text: 'race body text' })),
      fetchCpj: vi.fn(async () => []),
      queries: { narrative: [query], institutional: [] },
    };

    await runModule.runCycle(deps);

    expect(state.sourceInsertConflictCount).toBe(1);
    expect(state.sourceSelectByDomainCalls).toBe(2);
    expect(state.sources).toHaveLength(1);
    expect(state.sources[0]).toEqual(conflictSource);
    expect(state.sourceInsertPayloads).toHaveLength(1);
    expect(state.sourceInsertPayloads[0]).toEqual({
      domain: 'race.example',
      name: null,
      discovered_via: query,
    });

    expect(state.rawItems).toHaveLength(1);
    const raw = state.rawItems[0]!;
    expect(raw.source_id).toBe(conflictSource.id);
    expect(raw.url).toBe('https://race.example/article');
    expect(raw.headline).toBe('Race');
    expect(raw.raw_text).toBe('race body text');
    expect(raw.origin_type).toBe(ORIGIN_TYPE[0]);
    expect(state.rawUpsertCalls[0]!.options?.onConflict).toBe('url');
  });

  it('T3: CPJ pull is institutional_direct, stable, and idempotent', async () => {
    const runModule = await import('./run.ts');
    const { db, state } = createFakeDb();
    const cpjUrl =
      'https://cpj.org/2023/10/journalist-casualties-in-the-israel-gaza-war/';
    const originalText = 'CPJ published casualty wording.';
    const fetchCpj = vi
      .fn()
      .mockResolvedValueOnce([
        {
          url: cpjUrl,
          headline: 'Journalist casualties in the Israel-Gaza war',
          raw_text: originalText,
          published_at: '2023-10-13T06:00:00Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          url: cpjUrl,
          headline: 'Changed headline',
          raw_text: 'Changed text that must not overwrite the first ingestion.',
          published_at: '2023-10-14T06:00:00Z',
        },
      ]);

    const deps: Parameters<typeof runModule.runCycle>[0] = {
      db: db as unknown as Parameters<typeof runModule.runCycle>[0]['db'],
      serpSearch: vi.fn(async () => []),
      scrapeUrl: vi.fn(async () => ({ headline: null, raw_text: 'unused' })),
      fetchCpj,
      queries: { narrative: [], institutional: [] },
    };

    await runModule.runCycle(deps);

    expect(state.sources).toHaveLength(1);
    const source = state.sources[0]!;
    expect(source).toMatchObject({
      domain: 'cpj.org',
      name: 'Committee to Protect Journalists',
      source_type: 'institutional_direct',
      discovered_via: 'direct:cpj',
      discovery_tier: null,
      tier_reason: null,
    });
    expect(state.sourceInsertPayloads[0]).toEqual({
      domain: 'cpj.org',
      name: 'Committee to Protect Journalists',
      source_type: 'institutional_direct',
      discovered_via: 'direct:cpj',
    });
    expect(state.sourceInsertPayloads[0]).not.toHaveProperty('discovery_tier');
    expect(state.sourceInsertPayloads[0]).not.toHaveProperty('tier_reason');

    expect(state.rawItems).toHaveLength(1);
    const raw = state.rawItems[0]!;
    expect(raw).toMatchObject({
      source_id: source.id,
      url: cpjUrl,
      headline: 'Journalist casualties in the Israel-Gaza war',
      raw_text: originalText,
      published_at: '2023-10-13T06:00:00Z',
      origin_type: ORIGIN_TYPE[1],
      content_shape: 'unknown',
      processed: false,
    });
    expect(state.rawUpsertPayloads[0]).not.toHaveProperty('processed');
    expect(state.rawUpsertPayloads[0]).not.toHaveProperty('content_shape');
    expect(state.rawUpsertCalls[0]!.options).toEqual({
      onConflict: 'url',
      ignoreDuplicates: true,
    });

    source.discovery_tier = 'institutional';
    source.tier_reason = 'owned by Person B';
    raw.processed = true;
    raw.content_shape = 'structured';

    await runModule.runCycle(deps);

    expect(fetchCpj).toHaveBeenCalledTimes(2);
    expect(state.sources).toHaveLength(1);
    expect(state.rawItems).toHaveLength(1);
    expect(source.discovery_tier).toBe('institutional');
    expect(source.tier_reason).toBe('owned by Person B');
    expect(raw.raw_text).toBe(originalText);
    expect(raw.processed).toBe(true);
    expect(raw.content_shape).toBe('structured');
  });

  it('keeps search-discovered writes when the CPJ fetch fails', async () => {
    const runModule = await import('./run.ts');
    const { db, state } = createFakeDb();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps: Parameters<typeof runModule.runCycle>[0] = {
      db: db as unknown as Parameters<typeof runModule.runCycle>[0]['db'],
      serpSearch: vi.fn(async () => [
        {
          url: 'https://example.com/search-result',
          domain: 'example.com',
          title: 'Search result',
        },
      ]),
      scrapeUrl: vi.fn(async () => ({
        headline: 'Search result',
        raw_text: 'Successfully scraped search result.',
      })),
      fetchCpj: vi.fn(async () => {
        throw new Error('CPJ unavailable');
      }),
      queries: { narrative: ['test query'], institutional: [] },
    };

    await expect(runModule.runCycle(deps)).resolves.toBeUndefined();

    expect(state.rawItems).toHaveLength(1);
    expect(state.rawItems[0]!.url).toBe('https://example.com/search-result');
    expect(errorSpy).toHaveBeenCalledWith(
      '[discovery] CPJ fetch failed:',
      expect.any(Error),
    );
  });

  it('continues to later CPJ items when one item is malformed', async () => {
    const runModule = await import('./run.ts');
    const { db, state } = createFakeDb();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const validUrl =
      'https://cpj.org/2023/10/journalist-casualties-in-the-israel-gaza-war/';
    const deps: Parameters<typeof runModule.runCycle>[0] = {
      db: db as unknown as Parameters<typeof runModule.runCycle>[0]['db'],
      serpSearch: vi.fn(async () => []),
      scrapeUrl: vi.fn(async () => ({ headline: null, raw_text: 'unused' })),
      fetchCpj: vi.fn(async () => [
        {
          url: 'https://not-cpj.example/report',
          headline: 'Rejected',
          raw_text: 'Rejected text',
        },
        {
          url: validUrl,
          headline: 'CPJ report',
          raw_text: 'Official CPJ report text',
        },
      ]),
      queries: { narrative: [], institutional: [] },
    };

    await runModule.runCycle(deps);

    expect(state.sources).toHaveLength(1);
    expect(state.rawItems).toHaveLength(1);
    expect(state.rawItems[0]!.url).toBe(validUrl);
    expect(errorSpy).toHaveBeenCalledWith(
      '[discovery] failed processing CPJ item:',
      { url: 'https://not-cpj.example/report' },
      expect.any(Error),
    );
  });

  it('T4: 429 triggers backoff and retries successfully', async () => {
    const { withBackoff } = await import('./scrape.ts');
    const operation = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('rate limited'), { status: 429 }))
      .mockResolvedValueOnce({
        headline: null,
        raw_text: 'Exact article wording after retry.',
      });
    const sleep = vi.fn(async () => {});

    await expect(withBackoff(operation, { baseMs: 20, sleep })).resolves.toEqual({
      headline: null,
      raw_text: 'Exact article wording after retry.',
    });
    expect(operation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(20);
  });
});
