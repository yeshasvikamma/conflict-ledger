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
  external_id: string; // the post/tweet id, used to build a stable url
  author: string;
  text: string;
  url: string;
  posted_at: string | null;
}

/**
 * Query X via Grok for recent posts matching a query.
 *
 * TODO(Person B):
 *   - Read GROK_API_KEY from env.
 *   - Query Grok for recent X posts on `query`.
 *   - Return SignalPost[]. run.ts inserts them tagged origin_type='x'.
 *   - Query-driven, not a fixed account list (consistent with "no anchors").
 */
export async function grokSearch(query: string): Promise<SignalPost[]> {
  void query;
  throw new Error('grokSearch not implemented — see signal/AGENT.md');
}
