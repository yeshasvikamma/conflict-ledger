// =============================================================================
// api/sources.ts — GET /sources  [Person B]  (Tier A)
// =============================================================================
// The transparency endpoint: who's in the system and exactly why they're rated
// the way they are.
// =============================================================================

import type { Request, Response } from 'express';

/**
 * GET /sources
 * -> [{domain, name, tier, tier_reason, rating: {reliability, lean, methodology_url}}]
 *
 * TODO(Person B): select from sources; join the rating info you cached in
 * tiering (reliability/lean/methodology_url) where available.
 */
export async function getSources(_req: Request, res: Response): Promise<void> {
  res.status(501).json({ error: 'getSources not implemented — see tiering/AGENT.md' });
}
