// =============================================================================
// discovery/scrape.ts — Bright Data Web Unlocker  [Person A]
// =============================================================================
// Fetches full article content for a URL. MUST implement exponential backoff
// on 429/5xx, capped at 5 retries (see discovery.test.ts T4).
// =============================================================================

export interface ScrapeResult {
  headline: string | null;
  raw_text: string;
}

/**
 * Fetch and extract the main text of an article via Bright Data Web Unlocker.
 *
 * TODO(Person A):
 *   - Read BRIGHTDATA_API_KEY from env.
 *   - Fetch `url` through Web Unlocker.
 *   - Extract headline + main body text (raw_text must be non-empty).
 *   - Exponential backoff on 429/5xx, max 5 retries, then throw.
 */
export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  void url;
  throw new Error('scrapeUrl not implemented — see discovery/AGENT.md');
}

/**
 * Retry helper with exponential backoff. Provided so the backoff behavior is
 * consistent and testable (T4 mocks the fn to fail with 429 then succeed).
 *
 * TODO(Person A): you may use this or inline your own — but T4 must pass.
 */
export async function withBackoff<T>(
  fn: () => Promise<T>,
  opts: { maxRetries?: number; baseMs?: number } = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 5;
  const baseMs = opts.baseMs ?? 250;
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (attempt > maxRetries) throw err;
      const delay = baseMs * 2 ** (attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
