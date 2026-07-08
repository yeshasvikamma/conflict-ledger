// =============================================================================
// api/map.ts — GET /map  [Person C]  (Tier B)
// =============================================================================
import type { Request, Response } from 'express';

/**
 * GET /map?from=&to=
 * -> {points: [{lat,lng,category,event_id,title,date}],
 *     zones:  [{geo_json,zone_type,region,date,raw_quote,source}]}
 * Tier B. Two toggleable layers, scrubbable by date.
 */
export async function getMap(_req: Request, res: Response): Promise<void> {
  res.status(501).json({ error: 'getMap not implemented (Tier B)' });
}
