// =============================================================================
// signal/grok.ts — X/social signal via Grok  [Person B]
// =============================================================================
// Pulls X posts via the Grok API as an UNVERIFIED SIGNAL layer. This data is
// NEVER counted — it exists only as color/context, clearly labeled.
//
// The guarantee that it can't leak into a counter is enforced downstream by
// Person C's tier-gate + origin filter. Person B's ONE job here: tag correctly.
//   - sources.source_type = 'x'
//   - raw_items.origin_type = 'x'
//   - (Person C sets claims.is_unverified_signal = true for these)
// =============================================================================

export interface SignalPost {
  url: string;
  author_handle: string;
  text: string;
  posted_at: string | null;
}

type Fetcher = typeof fetch;

type GrokContentPart = {
  type?: string;
  text?: string;
};

type GrokOutputItem = {
  type?: string;
  content?: GrokContentPart[];
};

type GrokResponse = {
  output?: GrokOutputItem[];
  citations?: string[];
};

type RawSignalPost = Partial<SignalPost>;

/**
 * Query X via Grok for recent posts matching a query. Failures return an empty
 * list so one bad query does not stop the rest of the signal pass.
 */
export async function grokSearch(
  query: string,
  fetcher: Fetcher = fetch,
): Promise<SignalPost[]> {
  const apiKey = process.env.GROK_API_KEY;

  if (!apiKey) {
    console.warn('[signal] GROK_API_KEY missing; skipping Grok query');
    return [];
  }

  try {
    const response = await fetcher('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'grok-4',
        input: [
          {
            role: 'user',
            content:
              `Search X for recent posts matching: ${query}\n` +
              'Return only a JSON array of objects with url, author_handle, text, and posted_at fields. No markdown.',
          },
        ],
        tools: [
          {
            type: 'x_search',
          },
        ],
      }),
    });

    if (!response.ok) {
      console.warn(`[signal] Grok query failed for "${query}": ${response.status}`);
      return [];
    }

    return normalizeGrokResponse((await response.json()) as GrokResponse);
  } catch (err) {
    console.warn(`[signal] Grok query failed for "${query}":`, err);
    return [];
  }
}

function normalizeGrokResponse(response: GrokResponse): SignalPost[] {
  const outputText = extractOutputText(response);
  const parsedPosts = parsePosts(outputText);

  if (parsedPosts.length > 0) {
    return parsedPosts;
  }

  return (response.citations ?? [])
    .filter((url) => /\/\/(www\.)?x\.com\//.test(url))
    .map((url) => ({
      url,
      author_handle: authorFromUrl(url),
      text: outputText || url,
      posted_at: null,
    }));
}

function extractOutputText(response: GrokResponse): string {
  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === 'output_text' && part.text)
    .map((part) => part.text)
    .join('\n')
    .trim();
}

function parsePosts(text: string): SignalPost[] {
  const jsonText = text
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(jsonText) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(normalizePost).filter((post): post is SignalPost => !!post);
  } catch {
    return [];
  }
}

function normalizePost(post: RawSignalPost): SignalPost | null {
  if (!post.url || !post.text) {
    return null;
  }

  return {
    url: post.url,
    author_handle: post.author_handle ?? authorFromUrl(post.url),
    text: post.text,
    posted_at: post.posted_at ?? null,
  };
}

function authorFromUrl(url: string): string {
  try {
    const [handle] = new URL(url).pathname.split('/').filter(Boolean);
    return handle ? `@${handle.replace(/^@/, '')}` : '@unknown';
  } catch {
    return '@unknown';
  }
}
