// =============================================================================
// pipeline/snapshots.ts — compute tier-gated counter snapshots  [Person C]
// =============================================================================
// Aggregates reconciled claims into counter_snapshots as a low/high RANGE (never
// a single point), with the primary_source_ids behind each figure.
//
// ⭐ THE TIER GATE LIVES HERE AND NOWHERE ELSE. ⭐
// Only claims whose source sits in COUNTABLE_TIERS count. emerging_unverified
// and origin_type='x' are excluded by construction. Extraction runs on
// everything regardless of tier — only THIS counting step is gated. That
// decouples the counter from Person B's tiering speed: if tiering lags, the
// counter just temporarily undercounts; it never blocks extraction.
//
// Owns writes to: counter_snapshots (insert).
// =============================================================================

import { COUNTABLE_TIERS, isCountableTier } from '../shared/constants.ts';

/**
 * Recompute counter snapshots from current reconciled claims.
 *
 * TODO(Person C):
 *   1. join claims -> raw_items -> sources
 *   2. WHERE sources.discovery_tier IN COUNTABLE_TIERS
 *      AND raw_items.origin_type IN ('search_discovered','institutional_direct')
 *      (belt-and-suspenders: tier gate already excludes x, but be explicit)
 *   3. group into counter_key per claim_types.md mapping
 *   4. low_value / high_value = min / max across disagreeing sources
 *      (this is where the "range, not point" honesty shows up)
 *   5. record primary_source_ids + claim_count, insert a snapshot row per
 *      (counter_key, as_of_date)
 *
 * `isCountableTier` and `COUNTABLE_TIERS` are imported so you never hand-type
 * the gate.
 */
export async function computeSnapshots(): Promise<void> {
  void COUNTABLE_TIERS;
  void isCountableTier;
  throw new Error('computeSnapshots not implemented — see pipeline/AGENT.md');
}
