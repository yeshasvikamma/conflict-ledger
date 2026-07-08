// =============================================================================
// pipeline/cluster.ts — embedding-based event clustering  [Person C]
// =============================================================================
// Groups loosely-related claims into the same event via embedding cosine
// similarity. APPROXIMATE by design — it does not carry the correctness weight
// of disagreement.ts. It only assigns event membership for claims not already
// grouped by a disagreement pair. (pipeline.test.ts T5.)
//
// Tier A: keep this minimal. A crude grouping is fine; the counter and the
// disagreement demo do not depend on clustering being clever.
// =============================================================================

/** Cosine similarity between two equal-length vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Cluster recent claims into events by similarity of (headline + raw_quote).
 *
 * TODO(Person C):
 *   - embed headline + raw_quote via OpenAI text-embedding-3-small
 *   - compare against recently-open events (last ~72h)
 *   - above a threshold -> attach to that event; else -> new event
 *   - skip claims already grouped by disagreement detection
 */
export async function runClustering(): Promise<void> {
  throw new Error('runClustering not implemented — see pipeline/AGENT.md');
}
