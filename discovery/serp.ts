// =============================================================================
// discovery/serp.ts - Bright Data SERP API  [Person A]
// =============================================================================
// Calls Bright Data's SERP API for ONE query, returns a list of results.
// No hardcoded domains anywhere. See AGENT.md in this folder for the full spec.
// =============================================================================

export interface SerpResult {
  url: string;
  domain: string;
  title: string;
}

export type SerpRequest = (query: string) => Promise<unknown>;

function normalizeDomain(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '').replace(/\.+$/, '');
}

function toHttpUrl(input: unknown): URL | null {
  if (typeof input !== 'string' || !input) return null;
  try {
    const parsed = new URL(input);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed;
  } catch {
    return null;
  }
}

function extractOrganicArray(payload: unknown): unknown[] {
  if (!payload || typeof payload !== 'object') {
    throw new Error('[discovery] SERP response is malformed: expected an object');
  }

  const organic = (payload as Record<string, unknown>).organic;
  if (!Array.isArray(organic)) {
    throw new Error('[discovery] SERP response is malformed: expected an organic array');
  }
  return organic;
}

export function parseSerpResponse(payload: unknown): SerpResult[] {
  const candidates = extractOrganicArray(payload);
  const seenUrls = new Set<string>();
  const parsed: SerpResult[] = [];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const row = candidate as Record<string, unknown>;

    // Official field is `link`; keep `url` as compatibility fallback.
    const urlValue = typeof row.link === 'string' ? row.link : row.url;
    const parsedUrl = toHttpUrl(urlValue);
    if (!parsedUrl) continue;

    const domain = normalizeDomain(parsedUrl.hostname);
    if (!domain) continue;

    const finalUrl = parsedUrl.toString();
    if (seenUrls.has(finalUrl)) continue;
    seenUrls.add(finalUrl);

    parsed.push({
      url: finalUrl,
      domain,
      title: typeof row.title === 'string' ? row.title : '',
    });
  }

  return parsed;
}

async function requestBrightDataSerp(query: string): Promise<unknown> {
  const apiKey = process.env.BRIGHTDATA_API_KEY;
  if (!apiKey) {
    throw new Error('[discovery] Missing BRIGHTDATA_API_KEY');
  }

  const zone = process.env.BRIGHTDATA_SERP_ZONE;
  if (!zone) {
    throw new Error('[discovery] Missing BRIGHTDATA_SERP_ZONE');
  }

  const targetUrl = new URL('https://www.google.com/search');
  targetUrl.search = new URLSearchParams({ q: query }).toString();

  const response = await fetch('https://api.brightdata.com/request', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      zone,
      url: targetUrl.toString(),
      format: 'json',
      data_format: 'parsed',
    }),
  });

  if (!response.ok) {
    let detail = '';
    try {
      const message = (await response.text()).trim();
      if (message) {
        detail = ` (${message.slice(0, 200)})`;
      }
    } catch {
      // keep status-only message when body parsing fails
    }
    throw new Error(
      `[discovery] Bright Data SERP request failed with status ${response.status}${detail}`,
    );
  }

  try {
    return await response.json();
  } catch {
    throw new Error('[discovery] SERP response is malformed: invalid JSON');
  }
}

/**
 * Run one SERP query via Bright Data and return normalized organic results.
 */
export async function serpSearch(
  query: string,
  request: SerpRequest = requestBrightDataSerp,
): Promise<SerpResult[]> {
  if (!query.trim()) {
    throw new Error('[discovery] serpSearch query must be non-empty');
  }

  const payload = await request(query);
  return parseSerpResponse(payload);
}
