// =============================================================================
// api/entity.ts — GET /entity/:id  [Person C]  (Tier B)
// =============================================================================
import type { Request, Response } from 'express';

/**
 * GET /entity/:id
 * -> {entity, metadata, claims: [...], sources: [...]}
 * Tier B. Journalist / hostage / place profile pages.
 */
export async function getEntity(req: Request, res: Response): Promise<void> {
  void req.params.id;
  res.status(501).json({ error: 'getEntity not implemented (Tier B)' });
}
