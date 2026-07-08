// =============================================================================
// api/timeline.ts — GET /timeline  [Person C]  (Tier B)
// =============================================================================
import type { Request, Response } from 'express';

/**
 * GET /timeline?from=&to=&category=
 * -> [{event_id, title, event_date, category, lat, lng, neutral_summary, claim_count, source_count}]
 * Tier B. Do not build until Tier A is green.
 */
export async function getTimeline(_req: Request, res: Response): Promise<void> {
  res.status(501).json({ error: 'getTimeline not implemented (Tier B)' });
}
