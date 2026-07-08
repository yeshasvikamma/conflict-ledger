// =============================================================================
// api/counters.ts — /counters + /counters/:key/breakdown  [Person C]  (Tier A)
// =============================================================================
// Thin read endpoints over counter_snapshots + claims. The hard work already
// happened in the pipeline; these are just queries + JSON.
// =============================================================================

import type { Request, Response } from 'express';

/**
 * GET /counters
 * -> [{counter_key, low_value, high_value, as_of_date, primary_source_ids, claim_count}]
 * One row per counter (latest snapshot per counter_key). Always a range.
 *
 * TODO(Person C): select latest counter_snapshots grouped by counter_key.
 */
export async function getCounters(_req: Request, res: Response): Promise<void> {
  res
    .status(501)
    .json({ error: 'getCounters not implemented — see pipeline/AGENT.md' });
}

/**
 * GET /counters/:key/breakdown
 * -> {counter, claims: [{value, raw_quote, source: {name, tier, domain}, url, date}]}
 * Every sourced claim behind a counter. The credibility drilldown.
 *
 * TODO(Person C): join claims -> raw_items -> sources for counter_key = :key,
 * filtered to COUNTABLE_TIERS (same gate as snapshots).
 */
export async function getCounterBreakdown(req: Request, res: Response): Promise<void> {
  void req.params.key;
  res.status(501).json({ error: 'getCounterBreakdown not implemented' });
}
