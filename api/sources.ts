// =============================================================================
// api/sources.ts — GET /sources  [Person B]  (Tier A)
// =============================================================================
// The transparency endpoint: who's in the system and exactly why they're rated
// the way they are.
// =============================================================================

import type { Request, Response } from 'express';
import ratingsCache from '../tiering/ratings_cache.json';
import { anonClient } from '../shared/supabaseClient.ts';
import type { Database } from '../shared/types.ts';

type SourcesClient = ReturnType<typeof anonClient>;
type SourceRow = Pick<
  Database['public']['Tables']['sources']['Row'],
  'discovery_tier' | 'domain' | 'name' | 'tier_reason'
>;
type Rating = {
  reliability: string;
  lean: string;
  methodology_url: string;
};
type SourceResponse = {
  domain: string;
  name: string | null;
  tier: string | null;
  tier_reason: string | null;
  rating: Rating | null;
};

const RATINGS_CACHE = ratingsCache as Record<string, Rating>;

export function createGetSourcesHandler(
  clientFactory: () => SourcesClient = anonClient,
): (_req: Request, res: Response) => Promise<void> {
  return async function getSources(_req: Request, res: Response): Promise<void> {
    const { data, error } = await clientFactory()
      .from('sources')
      .select('domain, name, discovery_tier, tier_reason')
      .order('domain', { ascending: true });

    if (error) {
      res
        .status(500)
        .json({ error: `[api] failed to fetch sources: ${error.message}` });
      return;
    }

    res.json((data ?? []).map(toSourceResponse));
  };
}

function toSourceResponse(row: SourceRow): SourceResponse {
  return {
    domain: row.domain,
    name: row.name,
    tier: row.discovery_tier,
    tier_reason: row.tier_reason,
    rating: RATINGS_CACHE[row.domain] ?? null,
  };
}

/**
 * GET /sources
 * -> [{domain, name, tier, tier_reason, rating: {reliability, lean, methodology_url}}]
 */
export const getSources = createGetSourcesHandler();
