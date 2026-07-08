// =============================================================================
// api/event.ts — GET /event/:id  [Person C]  (Tier B)
// =============================================================================
// The divergence-view endpoint: one event plus every claim linked to it, each
// carrying its verbatim quote and source — so the frontend can show "Reuters
// said X / Al Jazeera said Y" side by side.
// =============================================================================

import type { Request, Response } from 'express';
import { anonClient } from '../shared/supabaseClient.ts';
import type { Database, Json } from '../shared/types.ts';

type ApiDb = Pick<ReturnType<typeof anonClient>, 'from'>;
type EventRow = Pick<
  Database['public']['Tables']['events']['Row'],
  | 'id'
  | 'title'
  | 'neutral_summary'
  | 'category'
  | 'event_date'
  | 'location'
  | 'has_disagreement'
  | 'disagreement_note'
>;
type EventClaimRow = Pick<
  Database['public']['Tables']['event_claims']['Row'],
  'claim_id'
>;
type ClaimRow = Pick<
  Database['public']['Tables']['claims']['Row'],
  'id' | 'raw_item_id' | 'value' | 'raw_quote' | 'date_occurred'
>;
type RawItemRow = Pick<
  Database['public']['Tables']['raw_items']['Row'],
  'id' | 'source_id' | 'url'
>;
type SourceRow = Pick<
  Database['public']['Tables']['sources']['Row'],
  'id' | 'name' | 'domain' | 'discovery_tier'
>;

type EventClaimDetail = {
  value: Json;
  raw_quote: string;
  date_occurred: string | null;
  source: {
    name: string | null;
    tier: string | null;
    domain: string;
  };
  url: string;
};

let dbForTest: ApiDb | null = null;

export function setEventDbForTest(db: ApiDb | null): void {
  dbForTest = db;
}

function db(): ApiDb {
  return dbForTest ?? anonClient();
}

/**
 * GET /event/:id
 * -> {event: {id, title, neutral_summary, category, event_date, location,
 *             has_disagreement, disagreement_note},
 *     claims: [{value, raw_quote, date_occurred, source: {name, tier, domain}, url}]}
 * 404 with a JSON error if the event doesn't exist.
 */
export async function getEvent(req: Request, res: Response): Promise<void> {
  const eventId = req.params.id ?? '';
  const apiDb = db();

  const { data: eventRows, error: eventError } = await apiDb
    .from('events')
    .select(
      'id, title, neutral_summary, category, event_date, location, has_disagreement, disagreement_note',
    )
    .eq('id', eventId)
    .limit(1);

  if (eventError) {
    res.status(500).json({ error: eventError.message });
    return;
  }

  const event = ((eventRows ?? []) as EventRow[])[0];
  if (!event) {
    res.status(404).json({ error: `event ${eventId} not found` });
    return;
  }

  const { data: eventClaimData, error: eventClaimError } = await apiDb
    .from('event_claims')
    .select('claim_id')
    .eq('event_id', eventId);

  if (eventClaimError) {
    res.status(500).json({ error: eventClaimError.message });
    return;
  }

  const claimIds = [
    ...new Set(((eventClaimData ?? []) as EventClaimRow[]).map((row) => row.claim_id)),
  ];
  let claims: ClaimRow[] = [];

  if (claimIds.length > 0) {
    const { data: claimData, error: claimError } = await apiDb
      .from('claims')
      .select('id, raw_item_id, value, raw_quote, date_occurred')
      .in('id', claimIds);

    if (claimError) {
      res.status(500).json({ error: claimError.message });
      return;
    }

    claims = (claimData ?? []) as ClaimRow[];
  }

  const rawItemIds = [...new Set(claims.map((claim) => claim.raw_item_id))];
  const rawItemsById = new Map<string, RawItemRow>();

  if (rawItemIds.length > 0) {
    const { data: rawItemData, error: rawItemError } = await apiDb
      .from('raw_items')
      .select('id, source_id, url')
      .in('id', rawItemIds);

    if (rawItemError) {
      res.status(500).json({ error: rawItemError.message });
      return;
    }

    for (const rawItem of (rawItemData ?? []) as RawItemRow[]) {
      rawItemsById.set(rawItem.id, rawItem);
    }
  }

  const sourceIds = [
    ...new Set([...rawItemsById.values()].map((rawItem) => rawItem.source_id)),
  ];
  const sourcesById = new Map<string, SourceRow>();

  if (sourceIds.length > 0) {
    const { data: sourceData, error: sourceError } = await apiDb
      .from('sources')
      .select('id, name, domain, discovery_tier')
      .in('id', sourceIds);

    if (sourceError) {
      res.status(500).json({ error: sourceError.message });
      return;
    }

    for (const source of (sourceData ?? []) as SourceRow[]) {
      sourcesById.set(source.id, source);
    }
  }

  const claimDetails: EventClaimDetail[] = [];
  for (const claim of claims) {
    const rawItem = rawItemsById.get(claim.raw_item_id);
    if (!rawItem) continue;
    const source = sourcesById.get(rawItem.source_id);
    if (!source) continue;

    claimDetails.push({
      value: claim.value,
      raw_quote: claim.raw_quote,
      date_occurred: claim.date_occurred,
      source: {
        name: source.name,
        tier: source.discovery_tier,
        domain: source.domain,
      },
      url: rawItem.url,
    });
  }

  res.json({
    event: {
      id: event.id,
      title: event.title,
      neutral_summary: event.neutral_summary,
      category: event.category,
      event_date: event.event_date,
      location: event.location,
      has_disagreement: event.has_disagreement,
      disagreement_note: event.disagreement_note,
    },
    claims: claimDetails.sort((a, b) =>
      (a.date_occurred ?? '').localeCompare(b.date_occurred ?? ''),
    ),
  });
}
