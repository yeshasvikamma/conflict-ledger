// =============================================================================
// pipeline/disagreement.ts — deterministic disagreement detection  [Person C]
// =============================================================================
// Implements the EXACT predicate from shared/claim_types.md §2. This is the
// project's money demo. It is a plain structured-field comparison — NOT
// embeddings. Embeddings live in cluster.ts and only group candidates; THIS
// decides disagreement.
//
// HARD RULE: claims are never averaged, dropped, or overwritten. Disagreement
// links both claims to one event and flags it. (pipeline.test.ts T2, T3.)
//
// Owns writes to: events (insert/update has_disagreement + disagreement_note),
//                 event_claims (insert).
// =============================================================================

import { randomUUID } from 'node:crypto';
import { CLAIM_TYPES, EVENT_CATEGORY } from '../shared/constants.ts';
import { serviceClient } from '../shared/supabaseClient.ts';
import type { Database, Json } from '../shared/types.ts';

const [JOURNALIST_KILLED_CLAIM_TYPE, CASUALTY_COUNT_CLAIM_TYPE] = CLAIM_TYPES;
const [, CASUALTY_EVENT_CATEGORY, JOURNALIST_EVENT_CATEGORY] = EVENT_CATEGORY;
const MAX_CANDIDATE_CLAIMS = 1000;

type DisagreementDb = Pick<ReturnType<typeof serviceClient>, 'from'>;
type ClaimRow = Pick<
  Database['public']['Tables']['claims']['Row'],
  'id' | 'claim_type' | 'date_occurred' | 'location' | 'value'
>;
type EventInsert = Database['public']['Tables']['events']['Insert'];
type EventClaimInsert = Database['public']['Tables']['event_claims']['Insert'];

export interface RunDisagreementDetectionOptions {
  db?: DisagreementDb;
}

/** A minimal claim view for the predicate (subset of the claims row). */
export interface ClaimForCompare {
  id: string;
  claim_type: string;
  date_occurred: string | null; // ISO date
  location: string | null;
  value: {
    count?: number;
    group?: string;
    subtype?: string | null;
    names?: string[];
    [k: string]: unknown;
  };
}

/** Absolute difference in days between two ISO dates, or Infinity if either is null. */
export function daysApart(a: string | null, b: string | null): number {
  if (!a || !b) return Infinity;
  const da = new Date(a).getTime();
  const dbb = new Date(b).getTime();
  if (Number.isNaN(da) || Number.isNaN(dbb)) return Infinity;
  return Math.abs(da - dbb) / (1000 * 60 * 60 * 24);
}

/** Do two journalist name arrays overlap (share at least one name)? */
export function namesOverlap(a: string[] = [], b: string[] = []): boolean {
  const setA = new Set(a.map((n) => n.trim().toLowerCase()));
  return b.some((n) => setA.has(n.trim().toLowerCase()));
}

/**
 * The predicate. Returns true iff the two claims DISAGREE per claim_types.md §2:
 *   same claim_type
 *   AND date_occurred within ±1 day
 *   AND same location/region
 *   AND same discriminators (group+subtype for casualties; names overlap for journalists)
 *   AND different count
 *
 * Provided fully-implemented for the Tier A types because it's the single
 * highest-correctness-weight function — build the rest of the track around it.
 * Extend the discriminator handling if you wire up Tier B claim types.
 */
export function claimsDisagree(a: ClaimForCompare, b: ClaimForCompare): boolean {
  if (a.claim_type !== b.claim_type) return false;
  if (daysApart(a.date_occurred, b.date_occurred) > 1) return false;

  const locA = (a.location ?? '').trim().toLowerCase();
  const locB = (b.location ?? '').trim().toLowerCase();
  if (locA !== locB) return false;

  if (a.claim_type === 'casualty_count') {
    if ((a.value.group ?? null) !== (b.value.group ?? null)) return false;
    if ((a.value.subtype ?? null) !== (b.value.subtype ?? null)) return false;
    return a.value.count !== b.value.count;
  }

  if (a.claim_type === 'journalist_killed') {
    if (!namesOverlap(a.value.names, b.value.names)) return false;
    return a.value.count !== b.value.count;
  }

  // Default (other types): same-count => agree. Extend per type in Tier B.
  return a.value.count !== b.value.count;
}

function claimValue(value: Json): ClaimForCompare['value'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as ClaimForCompare['value'];
}

function compareClaim(row: ClaimRow): ClaimForCompare {
  return {
    id: row.id,
    claim_type: row.claim_type,
    date_occurred: row.date_occurred,
    location: row.location,
    value: claimValue(row.value),
  };
}

function eventCategory(claimType: string): string {
  return claimType === JOURNALIST_KILLED_CLAIM_TYPE
    ? JOURNALIST_EVENT_CATEGORY
    : CASUALTY_EVENT_CATEGORY;
}

function countForNote(claim: ClaimForCompare): string {
  return typeof claim.value.count === 'number' ? String(claim.value.count) : 'unknown';
}

function disagreementNote(a: ClaimForCompare, b: ClaimForCompare): string {
  const date = a.date_occurred ?? b.date_occurred ?? 'unknown date';
  const location = a.location ?? b.location ?? 'unknown location';
  return `One claim reports ${countForNote(a)} on ${date} in ${location}; another reports ${countForNote(b)} for the same date/location.`;
}

function eventRowForPair(a: ClaimForCompare, b: ClaimForCompare): EventInsert {
  const location = a.location ?? b.location;
  const eventDate = a.date_occurred ?? b.date_occurred;
  return {
    id: randomUUID(),
    category: eventCategory(a.claim_type),
    event_date: eventDate,
    has_disagreement: true,
    disagreement_note: disagreementNote(a, b),
    location,
  };
}

async function existingDisagreementEventId(
  db: DisagreementDb,
  a: ClaimForCompare,
  b: ClaimForCompare,
): Promise<string | null> {
  const claimIds = [a.id, b.id];
  const { data: links, error: linkError } = await db
    .from('event_claims')
    .select('event_id, claim_id')
    .in('claim_id', claimIds)
    .limit(MAX_CANDIDATE_CLAIMS);
  if (linkError) throw linkError;

  const claimsByEvent = new Map<string, Set<string>>();
  for (const link of links ?? []) {
    const claims = claimsByEvent.get(link.event_id) ?? new Set<string>();
    claims.add(link.claim_id);
    claimsByEvent.set(link.event_id, claims);
  }

  const candidateEventIds = [...claimsByEvent.entries()]
    .filter(([, linkedClaimIds]) =>
      claimIds.every((claimId) => linkedClaimIds.has(claimId)),
    )
    .map(([eventId]) => eventId);

  if (candidateEventIds.length === 0) return null;

  const { data: events, error: eventError } = await db
    .from('events')
    .select('id')
    .in('id', candidateEventIds)
    .eq('has_disagreement', true)
    .limit(1);
  if (eventError) throw eventError;

  return events?.[0]?.id ?? null;
}

async function linkClaimsToEvent(
  db: DisagreementDb,
  eventId: string,
  a: ClaimForCompare,
  b: ClaimForCompare,
): Promise<void> {
  const rows: EventClaimInsert[] = [
    { event_id: eventId, claim_id: a.id },
    { event_id: eventId, claim_id: b.id },
  ];
  const { error } = await db
    .from('event_claims')
    .upsert(rows, { onConflict: 'event_id,claim_id' });
  if (error) throw error;
}

async function recordDisagreement(
  db: DisagreementDb,
  a: ClaimForCompare,
  b: ClaimForCompare,
): Promise<void> {
  const existingEventId = await existingDisagreementEventId(db, a, b);
  if (existingEventId) {
    await linkClaimsToEvent(db, existingEventId, a, b);
    return;
  }

  const event = eventRowForPair(a, b);
  const { error } = await db.from('events').insert(event);
  if (error) throw error;

  if (!event.id) {
    throw new Error('Disagreement event was inserted without an id');
  }

  await linkClaimsToEvent(db, event.id, a, b);
}

/**
 * Scan candidate claims, find disagreeing pairs, and record them.
 *
 * TODO(Person C):
 *   - pull recent claims (e.g. by claim_type + date window)
 *   - for each candidate pair, claimsDisagree(a, b)
 *   - when true: ensure ONE event links both via event_claims, set
 *     has_disagreement=true, write a short disagreement_note (see §3 examples)
 *   - never mutate the claims themselves
 */
export async function runDisagreementDetection(
  options: RunDisagreementDetectionOptions = {},
): Promise<void> {
  const db = options.db ?? serviceClient();
  const { data, error } = await db
    .from('claims')
    .select('id, claim_type, date_occurred, location, value')
    .in('claim_type', [JOURNALIST_KILLED_CLAIM_TYPE, CASUALTY_COUNT_CLAIM_TYPE])
    .limit(MAX_CANDIDATE_CLAIMS);
  if (error) throw error;

  const claims = (data ?? []).map((row) => compareClaim(row as ClaimRow));
  const claimsByType = new Map<string, ClaimForCompare[]>();
  for (const claim of claims) {
    const group = claimsByType.get(claim.claim_type) ?? [];
    group.push(claim);
    claimsByType.set(claim.claim_type, group);
  }

  for (const sameTypeClaims of claimsByType.values()) {
    for (let i = 0; i < sameTypeClaims.length; i += 1) {
      for (let j = i + 1; j < sameTypeClaims.length; j += 1) {
        const a = sameTypeClaims[i];
        const b = sameTypeClaims[j];
        if (!a || !b) continue;
        if (daysApart(a.date_occurred, b.date_occurred) > 1) continue;
        if (claimsDisagree(a, b)) {
          await recordDisagreement(db, a, b);
        }
      }
    }
  }
}
