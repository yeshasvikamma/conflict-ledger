// =============================================================================
// tiering/tier.ts — deterministic source tiering  [Person B]
// =============================================================================
// Given a domain, decide its trust tier. FULLY DETERMINISTIC — no LLM call here
// (reproducibility + auditability). See tiering/AGENT.md for the full spec.
// =============================================================================

import { DiscoveryTier } from '../shared/constants.ts';

export interface TierDecision {
  tier: DiscoveryTier;
  reason: string; // human-readable — this doubles as the methodology note for judges
}

// A short list of KNOWN WIRE AGENCIES. This is a CATEGORY FACT, not a curated
// "good sources" list — it classifies domains that happen to be wire services,
// it does not select which sources to trust. ~5 entries is fine.
const WIRE_AGENCIES = new Set<string>([
  'reuters.com',
  'apnews.com',
  'afp.com',
  'bloomberg.com',
  'ap.org',
]);

/**
 * Decide a tier for a domain.
 *
 * TODO(Person B):
 *   - Load ratings_cache.json (MBFC / Ad Fontes), keyed by domain.
 *   - If domain in WIRE_AGENCIES -> tier 'wire_service'.
 *   - Else if domain in cache    -> tier 'established' (reason cites the dataset).
 *   - Else                       -> tier 'emerging_unverified'
 *                                   (reason: "not found in reliability dataset").
 */
export function decideTier(domain: string): TierDecision {
  void domain;
  void WIRE_AGENCIES;
  throw new Error('decideTier not implemented — see tiering/AGENT.md');
}
