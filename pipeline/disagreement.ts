// =============================================================================
// pipeline/disagreement.ts — deterministic disagreement detection  [Person C]
// =============================================================================
// Implements the EXACT predicate from shared/claim_types.md §2. This is the
// project's money demo. It is a plain structured-field comparison — NOT
// embeddings. Embeddings live in cluster.ts and only group candidates; THIS
// decides disagreement.
//
// HARD RULE: claims are never averaged, dropped, or overwritten. Disagreement
// links both claims to one event and flags it. (pipeline.test.ts T2, T3.)
//
// Owns writes to: events (insert/update has_disagreement + disagreement_note),
//                 event_claims (insert).
// =============================================================================

/** A minimal claim view for the predicate (subset of the claims row). */
export interface ClaimForCompare {
  id: string;
  claim_type: string;
  date_occurred: string | null; // ISO date
  location: string | null;
  value: {
    count?: number;
    group?: string;
    subtype?: string | null;
    names?: string[];
    [k: string]: unknown;
  };
}

/** Absolute difference in days between two ISO dates, or Infinity if either is null. */
export function daysApart(a: string | null, b: string | null): number {
  if (!a || !b) return Infinity;
  const da = new Date(a).getTime();
  const dbb = new Date(b).getTime();
  if (Number.isNaN(da) || Number.isNaN(dbb)) return Infinity;
  return Math.abs(da - dbb) / (1000 * 60 * 60 * 24);
}

/** Do two journalist name arrays overlap (share at least one name)? */
export function namesOverlap(a: string[] = [], b: string[] = []): boolean {
  const setA = new Set(a.map((n) => n.trim().toLowerCase()));
  return b.some((n) => setA.has(n.trim().toLowerCase()));
}

/**
 * The predicate. Returns true iff the two claims DISAGREE per claim_types.md §2:
 *   same claim_type
 *   AND date_occurred within ±1 day
 *   AND same location/region
 *   AND same discriminators (group+subtype for casualties; names overlap for journalists)
 *   AND different count
 *
 * Provided fully-implemented for the Tier A types because it's the single
 * highest-correctness-weight function — build the rest of the track around it.
 * Extend the discriminator handling if you wire up Tier B claim types.
 */
export function claimsDisagree(a: ClaimForCompare, b: ClaimForCompare): boolean {
  if (a.claim_type !== b.claim_type) return false;
  if (daysApart(a.date_occurred, b.date_occurred) > 1) return false;

  const locA = (a.location ?? '').trim().toLowerCase();
  const locB = (b.location ?? '').trim().toLowerCase();
  if (locA !== locB) return false;

  if (a.claim_type === 'casualty_count') {
    if ((a.value.group ?? null) !== (b.value.group ?? null)) return false;
    if ((a.value.subtype ?? null) !== (b.value.subtype ?? null)) return false;
    return a.value.count !== b.value.count;
  }

  if (a.claim_type === 'journalist_killed') {
    if (!namesOverlap(a.value.names, b.value.names)) return false;
    return a.value.count !== b.value.count;
  }

  // Default (other types): same-count => agree. Extend per type in Tier B.
  return a.value.count !== b.value.count;
}

/**
 * Scan candidate claims, find disagreeing pairs, and record them.
 *
 * TODO(Person C):
 *   - pull recent claims (e.g. by claim_type + date window)
 *   - for each candidate pair, claimsDisagree(a, b)
 *   - when true: ensure ONE event links both via event_claims, set
 *     has_disagreement=true, write a short disagreement_note (see §3 examples)
 *   - never mutate the claims themselves
 */
export async function runDisagreementDetection(): Promise<void> {
  throw new Error('runDisagreementDetection not implemented — see pipeline/AGENT.md');
}
