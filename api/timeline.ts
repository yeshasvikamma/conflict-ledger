// =============================================================================
// api/timeline.ts — GET /timeline  [Person C]  (Tier B)
// =============================================================================
// Thin read endpoint over events + event_claims + claims + raw_items. Builds
// the scrollable timeline spine: one row per event, with claim/source counts
// rolled up in-memory (same manual-join style as counters.ts).
// =============================================================================

import type { Request, Response } from 'express';
import { anonClient } from '../shared/supabaseClient.ts';
import type { Database } from '../shared/types.ts';

type ApiDb = Pick<ReturnType<typeof anonClient>, 'from'>;
type EventRow = Pick<
  Database['public']['Tables']['events']['Row'],
  | 'id'
  | 'title'
  | 'event_date'
  | 'category'
  | 'lat'
  | 'lng'
  | 'neutral_summary'
  | 'has_disagreement'
>;
type EventClaimRow = Pick<
  Database['public']['Tables']['event_claims']['Row'],
  'event_id' | 'claim_id'
>;
type ClaimRow = Pick<
  Database['public']['Tables']['claims']['Row'],
  'id' | 'raw_item_id'
>;
type RawItemRow = Pick<
  Database['public']['Tables']['raw_items']['Row'],
  'id' | 'source_id'
>;

type TimelineEvent = {
  event_id: string;
  title: string | null;
  event_date: string | null;
  category: string | null;
  lat: number | null;
  lng: number | null;
  neutral_summary: string | null;
  claim_count: number;
  source_count: number;
  has_disagreement: boolean;
};

let dbForTest: ApiDb | null = null;

export function setTimelineDbForTest(db: ApiDb | null): void {
  dbForTest = db;
}

function db(): ApiDb {
  return dbForTest ?? anonClient();
}

/**
 * GET /timeline?from=&to=&category=
 * -> [{event_id, title, event_date, category, lat, lng, neutral_summary,
 *      claim_count, source_count, has_disagreement}]
 * Ordered by event_date ascending (oldest first) — the timeline spine.
 * from/to filter event_date (inclusive); category is an exact match. Both
 * optional; omit either to leave that bound/filter open.
 */
export async function getTimeline(req: Request, res: Response): Promise<void> {
  const { from, to, category } = req.query;
  const apiDb = db();

  let query = apiDb
    .from('events')
    .select(
      'id, title, event_date, category, lat, lng, neutral_summary, has_disagreement',
    )
    .order('event_date', { ascending: true });

  if (typeof from === 'string') query = query.gte('event_date', from);
  if (typeof to === 'string') query = query.lte('event_date', to);
  if (typeof category === 'string') query = query.eq('category', category);

  const { data: eventData, error: eventError } = await query;
  if (eventError) {
    res.status(500).json({ error: eventError.message });
    return;
  }

  const events = (eventData ?? []) as EventRow[];
  if (events.length === 0) {
    res.json([]);
    return;
  }

  const eventIds = events.map((event) => event.id);
  const { data: eventClaimData, error: eventClaimError } = await apiDb
    .from('event_claims')
    .select('event_id, claim_id')
    .in('event_id', eventIds);

  if (eventClaimError) {
    res.status(500).json({ error: eventClaimError.message });
    return;
  }

  const eventClaims = (eventClaimData ?? []) as EventClaimRow[];
  const claimIds = [...new Set(eventClaims.map((row) => row.claim_id))];
  const rawItemIdByClaimId = new Map<string, string>();

  if (claimIds.length > 0) {
    const { data: claimData, error: claimError } = await apiDb
      .from('claims')
      .select('id, raw_item_id')
      .in('id', claimIds);

    if (claimError) {
      res.status(500).json({ error: claimError.message });
      return;
    }

    for (const claim of (claimData ?? []) as ClaimRow[]) {
      rawItemIdByClaimId.set(claim.id, claim.raw_item_id);
    }
  }

  const rawItemIds = [...new Set([...rawItemIdByClaimId.values()])];
  const sourceIdByRawItemId = new Map<string, string>();

  if (rawItemIds.length > 0) {
    const { data: rawItemData, error: rawItemError } = await apiDb
      .from('raw_items')
      .select('id, source_id')
      .in('id', rawItemIds);

    if (rawItemError) {
      res.status(500).json({ error: rawItemError.message });
      return;
    }

    for (const rawItem of (rawItemData ?? []) as RawItemRow[]) {
      sourceIdByRawItemId.set(rawItem.id, rawItem.source_id);
    }
  }

  const claimIdsByEvent = new Map<string, Set<string>>();
  for (const row of eventClaims) {
    const claimIdSet = claimIdsByEvent.get(row.event_id) ?? new Set<string>();
    claimIdSet.add(row.claim_id);
    claimIdsByEvent.set(row.event_id, claimIdSet);
  }

  const timeline: TimelineEvent[] = events.map((event) => {
    const eventClaimIds = claimIdsByEvent.get(event.id) ?? new Set<string>();
    const sourceIds = new Set<string>();

    for (const claimId of eventClaimIds) {
      const rawItemId = rawItemIdByClaimId.get(claimId);
      const sourceId = rawItemId ? sourceIdByRawItemId.get(rawItemId) : undefined;
      if (sourceId) sourceIds.add(sourceId);
    }

    return {
      event_id: event.id,
      title: event.title,
      event_date: event.event_date,
      category: event.category,
      lat: event.lat,
      lng: event.lng,
      neutral_summary: event.neutral_summary,
      claim_count: eventClaimIds.size,
      source_count: sourceIds.size,
      has_disagreement: event.has_disagreement,
    };
  });

  res.json(timeline);
}
