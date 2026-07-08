import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSerpResponse, serpSearch } from './serp.ts';

let previousFetch: typeof globalThis.fetch | undefined;
let previousApiKey: string | undefined;
let previousZone: string | undefined;

beforeEach(() => {
  previousFetch = globalThis.fetch;
  previousApiKey = process.env.BRIGHTDATA_API_KEY;
  previousZone = process.env.BRIGHTDATA_SERP_ZONE;
});

afterEach(() => {
  if (previousFetch === undefined) {
    delete (globalThis as { fetch?: typeof globalThis.fetch }).fetch;
  } else {
    globalThis.fetch = previousFetch;
  }

  if (previousApiKey === undefined) {
    delete process.env.BRIGHTDATA_API_KEY;
  } else {
    process.env.BRIGHTDATA_API_KEY = previousApiKey;
  }

  if (previousZone === undefined) {
    delete process.env.BRIGHTDATA_SERP_ZONE;
  } else {
    process.env.BRIGHTDATA_SERP_ZONE = previousZone;
  }

  vi.restoreAllMocks();
});

describe('parseSerpResponse', () => {
  it('valid organic results produce { url, domain, title }', () => {
    const results = parseSerpResponse({
      organic: [{ link: 'https://www.Example.com/story', title: 'Story 1' }],
    });

    expect(results).toEqual([
      { url: 'https://www.example.com/story', domain: 'example.com', title: 'Story 1' },
    ]);
  });

  it('preserves subdomains', () => {
    const results = parseSerpResponse({
      organic: [{ link: 'https://news.example.com/update', title: 'Update' }],
    });

    expect(results).toEqual([
      { url: 'https://news.example.com/update', domain: 'news.example.com', title: 'Update' },
    ]);
  });

  it('deduplicates URLs while preserving first-seen order', () => {
    const results = parseSerpResponse({
      organic: [
        { link: 'https://example.com/a', title: 'first' },
        { link: 'https://example.com/a', title: 'second' },
        { link: 'https://example.com/b', title: 'third' },
      ],
    });

    expect(results).toEqual([
      { url: 'https://example.com/a', domain: 'example.com', title: 'first' },
      { url: 'https://example.com/b', domain: 'example.com', title: 'third' },
    ]);
  });

  it('skips invalid URLs, non-http protocols, and malformed entries', () => {
    const results = parseSerpResponse({
      organic: [
        null,
        { title: 'missing link' },
        { link: 'notaurl', title: 'bad' },
        { link: 'ftp://example.com/file', title: 'ftp' },
        { link: 'http://www.good.com./ok', title: 'good' },
      ],
    });

    expect(results).toEqual([{ url: 'http://www.good.com./ok', domain: 'good.com', title: 'good' }]);
  });

  it('returns [] for empty organic array', () => {
    expect(parseSerpResponse({ organic: [] })).toEqual([]);
  });

  it('throws for malformed top-level response', () => {
    expect(() => parseSerpResponse({ results: [] })).toThrow(
      '[discovery] SERP response is malformed: expected an organic array',
    );
  });
});

describe('serpSearch', () => {
  it('rejects empty or whitespace-only query', async () => {
    const request = vi.fn();

    await expect(serpSearch('', request)).rejects.toThrow('serpSearch query must be non-empty');
    await expect(serpSearch('   ', request)).rejects.toThrow('serpSearch query must be non-empty');
    expect(request).not.toHaveBeenCalled();
  });

  it('uses Bright Data Direct API contract in production request', async () => {
    process.env.BRIGHTDATA_API_KEY = 'test-key';
    process.env.BRIGHTDATA_SERP_ZONE = 'test-serp-zone';

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ organic: [{ link: 'https://example.com/story', title: 'Story' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const query = '  exact query value  ';
    const results = await serpSearch(query);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.brightdata.com/request');
    expect(init.method).toBe('POST');

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-key');
    expect(headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(String(init.body)) as {
      zone: string;
      url: string;
      format: string;
      data_format: string;
    };
    expect(body.zone).toBe('test-serp-zone');
    expect(body.format).toBe('json');
    expect(body.data_format).toBe('parsed');

    const target = new URL(body.url);
    expect(target.origin + target.pathname).toBe('https://www.google.com/search');
    expect(target.searchParams.get('q')).toBe(query);

    expect(results).toEqual([
      { url: 'https://example.com/story', domain: 'example.com', title: 'Story' },
    ]);
  });

  it('throws before fetch when API key is missing', async () => {
    delete process.env.BRIGHTDATA_API_KEY;
    process.env.BRIGHTDATA_SERP_ZONE = 'test-serp-zone';

    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await expect(serpSearch('query')).rejects.toThrow('[discovery] Missing BRIGHTDATA_API_KEY');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws before fetch when SERP zone is missing', async () => {
    process.env.BRIGHTDATA_API_KEY = 'test-key';
    delete process.env.BRIGHTDATA_SERP_ZONE;

    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await expect(serpSearch('query')).rejects.toThrow('[discovery] Missing BRIGHTDATA_SERP_ZONE');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws with status on non-2xx response', async () => {
    process.env.BRIGHTDATA_API_KEY = 'test-key';
    process.env.BRIGHTDATA_SERP_ZONE = 'test-serp-zone';

    const fetchMock = vi.fn(async () => new Response('Unauthorized', { status: 401 }));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await expect(serpSearch('query')).rejects.toThrow(
      '[discovery] Bright Data SERP request failed with status 401',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws a clear error when response JSON is malformed', async () => {
    process.env.BRIGHTDATA_API_KEY = 'test-key';
    process.env.BRIGHTDATA_SERP_ZONE = 'test-serp-zone';

    const fetchMock = vi.fn(async () => new Response('not-json', { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await expect(serpSearch('query')).rejects.toThrow(
      '[discovery] SERP response is malformed: invalid JSON',
    );
  });
});
