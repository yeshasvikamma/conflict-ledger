// =============================================================================
// discovery/scrape.ts — Bright Data Web Unlocker  [Person A]
// =============================================================================
// Fetches full article content for a URL. Retries HTTP 429/5xx with exponential
// backoff, capped at 5 retries (see discovery.test.ts T4).
// =============================================================================

export interface ScrapeResult {
  headline: string | null;
  raw_text: string;
}

export type BackoffOptions = {
  maxRetries?: number;
  baseMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

function retryableStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;

  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown };
  };
  const status = candidate.status ?? candidate.statusCode ?? candidate.response?.status;
  return typeof status === 'number' ? status : undefined;
}

function isRetryable(error: unknown): boolean {
  const status = retryableStatus(error);
  return status === 429 || (status !== undefined && status >= 500 && status <= 599);
}

/**
 * Retry HTTP 429 and 5xx failures with exponential backoff.
 */
export async function withBackoff<T>(
  fn: () => Promise<T>,
  opts: BackoffOptions = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 5;
  const baseMs = opts.baseMs ?? 250;
  const sleep =
    opts.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let retries = 0;

  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryable(err) || retries >= maxRetries) {
        throw err;
      }

      const delay = baseMs * 2 ** retries;
      retries += 1;
      await sleep(delay);
    }
  }
}

function validateArticleUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('[discovery] scrapeUrl requires a valid HTTP or HTTPS URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('[discovery] scrapeUrl requires a valid HTTP or HTTPS URL');
  }
  return parsed;
}

function brightDataError(status: number): Error & { status: number } {
  return Object.assign(
    new Error(
      `[discovery] Bright Data Web Unlocker request failed with status ${status}`,
    ),
    { status },
  );
}

/**
 * Fetch raw article content through Bright Data's Web Unlocker Direct API.
 *
 * The raw response is preserved verbatim; headline extraction remains null
 * unless a later, reliable parser is introduced.
 */
export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  const articleUrl = validateArticleUrl(url);
  const apiKey = process.env.BRIGHTDATA_API_KEY;
  if (!apiKey) {
    throw new Error('[discovery] Missing BRIGHTDATA_API_KEY');
  }

  const zone = process.env.BRIGHTDATA_UNLOCKER_ZONE;
  if (!zone) {
    throw new Error('[discovery] Missing BRIGHTDATA_UNLOCKER_ZONE');
  }

  const rawText = await withBackoff(async () => {
    const response = await fetch('https://api.brightdata.com/request', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        zone,
        url: articleUrl.toString(),
        format: 'raw',
      }),
    });

    if (!response.ok) {
      throw brightDataError(response.status);
    }
    return response.text();
  });

  if (!rawText.trim()) {
    throw new Error('[discovery] Bright Data Web Unlocker returned blank content');
  }

  return {
    headline: null,
    raw_text: rawText,
  };
}
