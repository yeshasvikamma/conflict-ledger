// =============================================================================
// api/event.ts — GET /event/:id  [Person C]  (Tier B)
// =============================================================================
import type { Request, Response } from 'express';

/**
 * GET /event/:id
 * -> {event, claims: [...with sources...], framing_notes, entities: [...]}
 * Tier B. Includes the divergence-view data (multiple outlets side by side).
 */
export async function getEvent(req: Request, res: Response): Promise<void> {
  void req.params.id;
  res.status(501).json({ error: 'getEvent not implemented (Tier B)' });
}
