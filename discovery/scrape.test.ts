import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scrapeUrl, withBackoff } from './scrape.ts';

let previousFetch: typeof globalThis.fetch | undefined;
let previousApiKey: string | undefined;
let previousZone: string | undefined;

beforeEach(() => {
  previousFetch = globalThis.fetch;
  previousApiKey = process.env.BRIGHTDATA_API_KEY;
  previousZone = process.env.BRIGHTDATA_UNLOCKER_ZONE;
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
    delete process.env.BRIGHTDATA_UNLOCKER_ZONE;
  } else {
    process.env.BRIGHTDATA_UNLOCKER_ZONE = previousZone;
  }

  vi.restoreAllMocks();
});

describe('withBackoff', () => {
  it('retries a 503 response status and then succeeds', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValueOnce('success');
    const sleep = vi.fn(async () => {});

    await expect(withBackoff(operation, { baseMs: 10, sleep })).resolves.toBe(
      'success',
    );
    expect(operation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(10);
  });

  it.each([400, 401, 403, 404])('does not retry a %i response', async (status) => {
    const error = Object.assign(new Error('non-retryable response'), {
      statusCode: status,
    });
    const operation = vi.fn(async () => {
      throw error;
    });
    const sleep = vi.fn(async () => {});

    await expect(withBackoff(operation, { sleep })).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('does not retry an ordinary error without an HTTP status', async () => {
    const error = new Error('validation failed');
    const operation = vi.fn(async () => {
      throw error;
    });
    const sleep = vi.fn(async () => {});

    await expect(withBackoff(operation, { sleep })).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('stops after the configured retry limit', async () => {
    const error = Object.assign(new Error('unavailable'), { status: 503 });
    const operation = vi.fn(async () => {
      throw error;
    });
    const sleep = vi.fn(async () => {});

    await expect(
      withBackoff(operation, { maxRetries: 3, baseMs: 10, sleep }),
    ).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it('defaults to five retries after the initial attempt', async () => {
    const error = Object.assign(new Error('unavailable'), { status: 500 });
    const operation = vi.fn(async () => {
      throw error;
    });
    const sleep = vi.fn(async () => {});

    await expect(withBackoff(operation, { sleep })).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(6);
    expect(sleep).toHaveBeenCalledTimes(5);
  });

  it('uses exponential delays', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce({ status: 500 })
      .mockRejectedValueOnce({ status: 502 })
      .mockRejectedValueOnce({ status: 599 })
      .mockResolvedValueOnce('success');
    const delays: number[] = [];

    await withBackoff(operation, {
      baseMs: 25,
      sleep: async (ms) => {
        delays.push(ms);
      },
    });

    expect(delays).toEqual([25, 50, 100]);
  });
});

describe('scrapeUrl', () => {
  it('uses the Bright Data Web Unlocker Direct API and preserves raw wording', async () => {
    process.env.BRIGHTDATA_API_KEY = 'test-key';
    process.env.BRIGHTDATA_UNLOCKER_ZONE = 'test-unlocker-zone';
    const publishedText = '<article>Exact publisher wording.</article>';
    const fetchMock = vi.fn<typeof globalThis.fetch>(
      async () => new Response(publishedText),
    );
    globalThis.fetch = fetchMock;

    await expect(scrapeUrl('https://example.com/story')).resolves.toEqual({
      headline: null,
      raw_text: publishedText,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetchMock.mock.calls[0]!;
    expect(endpoint).toBe('https://api.brightdata.com/request');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({
      Authorization: 'Bearer test-key',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      zone: 'test-unlocker-zone',
      url: 'https://example.com/story',
      format: 'raw',
    });
  });

  it('rejects invalid and non-HTTP article URLs before fetch', async () => {
    process.env.BRIGHTDATA_API_KEY = 'test-key';
    process.env.BRIGHTDATA_UNLOCKER_ZONE = 'test-unlocker-zone';
    const fetchMock = vi.fn<typeof globalThis.fetch>();
    globalThis.fetch = fetchMock;

    await expect(scrapeUrl('not-a-url')).rejects.toThrow(
      'scrapeUrl requires a valid HTTP or HTTPS URL',
    );
    await expect(scrapeUrl('ftp://example.com/story')).rejects.toThrow(
      'scrapeUrl requires a valid HTTP or HTTPS URL',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a missing API key before fetch', async () => {
    delete process.env.BRIGHTDATA_API_KEY;
    process.env.BRIGHTDATA_UNLOCKER_ZONE = 'test-unlocker-zone';
    const fetchMock = vi.fn<typeof globalThis.fetch>();
    globalThis.fetch = fetchMock;

    await expect(scrapeUrl('https://example.com/story')).rejects.toThrow(
      '[discovery] Missing BRIGHTDATA_API_KEY',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a missing unlocker zone before fetch', async () => {
    process.env.BRIGHTDATA_API_KEY = 'test-key';
    delete process.env.BRIGHTDATA_UNLOCKER_ZONE;
    const fetchMock = vi.fn<typeof globalThis.fetch>();
    globalThis.fetch = fetchMock;

    await expect(scrapeUrl('https://example.com/story')).rejects.toThrow(
      '[discovery] Missing BRIGHTDATA_UNLOCKER_ZONE',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws clearly without retrying a non-retryable response', async () => {
    process.env.BRIGHTDATA_API_KEY = 'test-key';
    process.env.BRIGHTDATA_UNLOCKER_ZONE = 'test-unlocker-zone';
    const fetchMock = vi.fn<typeof globalThis.fetch>(
      async () => new Response('Unauthorized', { status: 401 }),
    );
    globalThis.fetch = fetchMock;

    await expect(scrapeUrl('https://example.com/story')).rejects.toThrow(
      '[discovery] Bright Data Web Unlocker request failed with status 401',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects blank response content', async () => {
    process.env.BRIGHTDATA_API_KEY = 'test-key';
    process.env.BRIGHTDATA_UNLOCKER_ZONE = 'test-unlocker-zone';
    const fetchMock = vi.fn<typeof globalThis.fetch>(async () => new Response('   \n'));
    globalThis.fetch = fetchMock;

    await expect(scrapeUrl('https://example.com/story')).rejects.toThrow(
      '[discovery] Bright Data Web Unlocker returned blank content',
    );
  });
});
