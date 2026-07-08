// =============================================================================
// discovery/cpj.ts — CPJ direct pull  [Person A]
// =============================================================================
// ⚠️  DELIBERATE EXCEPTION TO "NO HARDCODED SOURCES" ⚠️
//
// General discovery uses Bright Data SERP and never relies on a fixed publisher
// list. This file is the ONE intentional exception: a direct pull from the
// Committee to Protect Journalists, an institutional primary-data source.
//
// Direct retrieval is more reliable than relying only on narrative articles for
// CPJ's structured casualty reporting, and the flagship journalists_killed
// counter depends on accurate source material. The resulting source and items
// are explicitly tagged as institutional_direct and direct:cpj.
//
// This is the only place in the codebase permitted to name a specific source.
// =============================================================================

export interface CpjItem {
  url: string;
  headline: string | null;
  raw_text: string;
  published_at?: string | null;
}

export type CpjRequest = () => Promise<unknown>;

type CpjReportDocument = {
  url: string;
  html: string;
};

const CPJ_REPORT_URL =
  'https://cpj.org/2023/10/journalist-casualties-in-the-israel-gaza-war/';

function getAttribute(tag: string, name: string): string | null {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'),
  );
  return match?.[1] ?? match?.[2] ?? null;
}

function decodeHtml(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    hellip: '…',
    ldquo: '“',
    lsquo: '‘',
    lt: '<',
    mdash: '—',
    nbsp: ' ',
    ndash: '–',
    quot: '"',
    rdquo: '”',
    rsquo: '’',
  };

  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith('#x')) {
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    }
    if (code.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    }
    return namedEntities[code.toLowerCase()] ?? entity;
  });
}

function htmlToText(html: string): string {
  return decodeHtml(
    html
      .replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:address|article|blockquote|div|h[1-6]|li|p|section)>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '- ')
      .replace(/<[^>]+>/g, ''),
  )
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function extractMetaContent(html: string, property: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const key = getAttribute(tag, 'property') ?? getAttribute(tag, 'name');
    if (key?.toLowerCase() === property.toLowerCase()) {
      return getAttribute(tag, 'content');
    }
  }
  return null;
}

function extractCanonicalUrl(html: string): string | null {
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const rel = getAttribute(tag, 'rel');
    if (rel?.toLowerCase().split(/\s+/).includes('canonical')) {
      return getAttribute(tag, 'href');
    }
  }
  return null;
}

function extractHeadline(html: string): string | null {
  const metadataTitle = extractMetaContent(html, 'og:title');
  if (metadataTitle?.trim()) {
    return decodeHtml(metadataTitle).trim();
  }

  const heading = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const text = heading ? htmlToText(heading) : '';
  return text || null;
}

function extractPublishedAt(html: string): string | null {
  const metadataDate = extractMetaContent(html, 'article:published_time');
  if (metadataDate?.trim()) {
    return metadataDate.trim();
  }

  const timeTags = html.match(/<time\b[^>]*>/gi) ?? [];
  for (const tag of timeTags) {
    const date = getAttribute(tag, 'datetime');
    if (date?.trim()) {
      return date.trim();
    }
  }
  return null;
}

function extractArticleText(html: string): string {
  const content =
    html.match(
      /<(?:div|section)\b[^>]*class=(?:"[^"]*(?:entry-content|post-content)[^"]*"|'[^']*(?:entry-content|post-content)[^']*')[^>]*>([\s\S]*?)<\/(?:div|section)>/i,
    )?.[1] ?? html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1];

  return content ? htmlToText(content) : '';
}

function isOfficialCpjUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      (url.hostname === 'cpj.org' || url.hostname.endsWith('.cpj.org'))
    );
  } catch {
    return false;
  }
}

function parseReport(document: unknown): CpjItem | null {
  if (!document || typeof document !== 'object') return null;
  const record = document as Partial<CpjReportDocument>;
  if (typeof record.html !== 'string' || typeof record.url !== 'string') return null;

  const canonicalUrl = extractCanonicalUrl(record.html) ?? record.url;
  if (!isOfficialCpjUrl(canonicalUrl)) return null;

  const rawText = extractArticleText(record.html);
  if (!rawText.trim()) return null;

  return {
    url: new URL(canonicalUrl).toString(),
    headline: extractHeadline(record.html),
    raw_text: rawText,
    published_at: extractPublishedAt(record.html),
  };
}

/**
 * Parse the locally wrapped response from CPJ's official report page.
 *
 * CPJ's documented beta API currently states that access is temporarily
 * unavailable, so the production request retrieves the official report HTML.
 */
export function parseCpjResponse(payload: unknown): CpjItem[] {
  if (!payload || typeof payload !== 'object') {
    throw new Error('[discovery] CPJ response is malformed: expected an object');
  }

  const reports = (payload as { reports?: unknown }).reports;
  if (!Array.isArray(reports)) {
    throw new Error('[discovery] CPJ response is malformed: expected a reports array');
  }

  const seenUrls = new Set<string>();
  const items: CpjItem[] = [];
  for (const report of reports) {
    const item = parseReport(report);
    if (!item || seenUrls.has(item.url)) continue;
    seenUrls.add(item.url);
    items.push(item);
  }
  return items;
}

async function requestOfficialCpjReport(): Promise<unknown> {
  const response = await fetch(CPJ_REPORT_URL, {
    headers: { Accept: 'text/html' },
  });
  if (!response.ok) {
    throw new Error(`[discovery] CPJ request failed with status ${response.status}`);
  }

  return {
    reports: [
      {
        url: CPJ_REPORT_URL,
        html: await response.text(),
      },
    ],
  };
}

/**
 * Pull CPJ's official journalist-casualty report.
 */
export async function fetchCpj(
  request: CpjRequest = requestOfficialCpjReport,
): Promise<CpjItem[]> {
  return parseCpjResponse(await request());
}
