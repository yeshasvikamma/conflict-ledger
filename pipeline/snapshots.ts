// =============================================================================
// pipeline/snapshots.ts — compute tier-gated counter snapshots  [Person C]
// =============================================================================
// Aggregates reconciled claims into counter_snapshots as a low/high RANGE (never
// a single point), with the primary_source_ids behind each figure.
//
// ⭐ THE TIER GATE LIVES HERE AND NOWHERE ELSE. ⭐
// Only claims whose source sits in COUNTABLE_TIERS count. emerging_unverified
// and origin_type='x' are excluded by construction. Extraction runs on
// everything regardless of tier — only THIS counting step is gated. That
// decouples the counter from Person B's tiering speed: if tiering lags, the
// counter just temporarily undercounts; it never blocks extraction.
//
// Owns writes to: counter_snapshots (insert).
// =============================================================================

import {
  CLAIM_TYPES,
  COUNTABLE_TIERS,
  ORIGIN_TYPE,
  isCountableTier,
} from '../shared/constants.ts';
import { serviceClient } from '../shared/supabaseClient.ts';
import type { Database, Json } from '../shared/types.ts';

const [JOURNALIST_KILLED_CLAIM_TYPE, CASUALTY_COUNT_CLAIM_TYPE] = CLAIM_TYPES;
const [SEARCH_DISCOVERED_ORIGIN_TYPE, INSTITUTIONAL_DIRECT_ORIGIN_TYPE] = ORIGIN_TYPE;
const COUNTABLE_TIER_NAMES = new Set<string>(COUNTABLE_TIERS);
const COUNTABLE_ORIGIN_TYPES = new Set<string>([
  SEARCH_DISCOVERED_ORIGIN_TYPE,
  INSTITUTIONAL_DIRECT_ORIGIN_TYPE,
]);
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

const JOURNALISTS_KILLED_COUNTER = 'journalists_killed';
const PALESTINIANS_KILLED_COUNTER = 'palestinians_killed';
const ISRAELIS_KILLED_COUNTER = 'israelis_killed';
const CHILDREN_KILLED_COUNTER = 'children_killed';

type SnapshotDb = Pick<ReturnType<typeof serviceClient>, 'from'>;
type ClaimRow = Pick<
  Database['public']['Tables']['claims']['Row'],
  'id' | 'raw_item_id' | 'claim_type' | 'value' | 'date_occurred'
>;
type RawItemRow = Pick<
  Database['public']['Tables']['raw_items']['Row'],
  'id' | 'source_id' | 'origin_type'
>;
type SourceRow = Pick<
  Database['public']['Tables']['sources']['Row'],
  'id' | 'discovery_tier'
>;
type SnapshotInsert = Database['public']['Tables']['counter_snapshots']['Insert'];

export interface ComputeSnapshotsOptions {
  db?: SnapshotDb;
}

type ClaimValue = {
  count?: unknown;
  group?: unknown;
  subtype?: unknown;
};

type SnapshotGroup = {
  counter_key: string;
  as_of_date: string;
  low_value: number;
  high_value: number;
  primary_source_ids: Set<string>;
  claim_count: number;
};

function asClaimValue(value: Json): ClaimValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as ClaimValue;
}

function numericCount(value: ClaimValue): number | null {
  return typeof value.count === 'number' && Number.isFinite(value.count)
    ? value.count
    : null;
}

function isCountableOrigin(originType: string): boolean {
  return COUNTABLE_ORIGIN_TYPES.has(originType);
}

function passesTierGate(tier: string | null): boolean {
  return isCountableTier(tier) && !!tier && COUNTABLE_TIER_NAMES.has(tier);
}

function counterKeyForClaim(claimType: string, value: ClaimValue): string | null {
  if (claimType === JOURNALIST_KILLED_CLAIM_TYPE) {
    return JOURNALISTS_KILLED_COUNTER;
  }

  if (claimType !== CASUALTY_COUNT_CLAIM_TYPE) return null;

  if (value.subtype === 'child') return CHILDREN_KILLED_COUNTER;
  if (value.subtype !== 'total' && value.subtype !== null) return null;

  if (value.group === 'palestinian') return PALESTINIANS_KILLED_COUNTER;
  if (value.group === 'israeli') return ISRAELIS_KILLED_COUNTER;
  return null;
}

function groupKey(counterKey: string, asOfDate: string): string {
  return `${counterKey}\u0000${asOfDate}`;
}

function upsertGroup(
  groups: Map<string, SnapshotGroup>,
  counterKey: string,
  asOfDate: string,
  count: number,
  sourceId: string,
): void {
  const key = groupKey(counterKey, asOfDate);
  const existing = groups.get(key);
  if (!existing) {
    groups.set(key, {
      counter_key: counterKey,
      as_of_date: asOfDate,
      low_value: count,
      high_value: count,
      primary_source_ids: new Set([sourceId]),
      claim_count: 1,
    });
    return;
  }

  existing.low_value = Math.min(existing.low_value, count);
  existing.high_value = Math.max(existing.high_value, count);
  existing.primary_source_ids.add(sourceId);
  existing.claim_count += 1;
}

function snapshotRows(groups: Map<string, SnapshotGroup>): SnapshotInsert[] {
  return [...groups.values()]
    .map((group) => ({
      counter_key: group.counter_key,
      as_of_date: group.as_of_date,
      low_value: group.low_value,
      high_value: group.high_value,
      primary_source_ids: [...group.primary_source_ids].sort(),
      claim_count: group.claim_count,
    }))
    .sort((a, b) =>
      `${a.counter_key}:${a.as_of_date}`.localeCompare(
        `${b.counter_key}:${b.as_of_date}`,
      ),
    );
}

async function clearCounterSnapshots(db: SnapshotDb): Promise<void> {
  const { error } = await db.from('counter_snapshots').delete().neq('id', ZERO_UUID);
  if (error) throw error;
}

/**
 * Recompute counter snapshots from current reconciled claims.
 *
 * TODO(Person C):
 *   1. join claims -> raw_items -> sources
 *   2. WHERE sources.discovery_tier IN COUNTABLE_TIERS
 *      AND raw_items.origin_type IN ('search_discovered','institutional_direct')
 *      (belt-and-suspenders: tier gate already excludes x, but be explicit)
 *   3. group into counter_key per claim_types.md mapping
 *   4. low_value / high_value = min / max across disagreeing sources
 *      (this is where the "range, not point" honesty shows up)
 *   5. record primary_source_ids + claim_count, insert a snapshot row per
 *      (counter_key, as_of_date)
 *
 * `isCountableTier` and `COUNTABLE_TIERS` are imported so you never hand-type
 * the gate.
 */
export async function computeSnapshots(
  options: ComputeSnapshotsOptions = {},
): Promise<void> {
  const db = options.db ?? serviceClient();
  const { data: claimData, error: claimError } = await db
    .from('claims')
    .select('id, raw_item_id, claim_type, value, date_occurred')
    .in('claim_type', [JOURNALIST_KILLED_CLAIM_TYPE, CASUALTY_COUNT_CLAIM_TYPE]);
  if (claimError) throw claimError;

  const claims = (claimData ?? []) as ClaimRow[];
  const rawItemIds = [...new Set(claims.map((claim) => claim.raw_item_id))];
  const rawItemsById = new Map<string, RawItemRow>();

  if (rawItemIds.length > 0) {
    const { data: rawItemData, error: rawItemError } = await db
      .from('raw_items')
      .select('id, source_id, origin_type')
      .in('id', rawItemIds);
    if (rawItemError) throw rawItemError;
    for (const rawItem of (rawItemData ?? []) as RawItemRow[]) {
      rawItemsById.set(rawItem.id, rawItem);
    }
  }

  const sourceIds = [
    ...new Set([...rawItemsById.values()].map((rawItem) => rawItem.source_id)),
  ];
  const sourcesById = new Map<string, SourceRow>();

  if (sourceIds.length > 0) {
    const { data: sourceData, error: sourceError } = await db
      .from('sources')
      .select('id, discovery_tier')
      .in('id', sourceIds);
    if (sourceError) throw sourceError;
    for (const source of (sourceData ?? []) as SourceRow[]) {
      sourcesById.set(source.id, source);
    }
  }

  const groups = new Map<string, SnapshotGroup>();
  for (const claim of claims) {
    if (!claim.date_occurred) continue;

    const rawItem = rawItemsById.get(claim.raw_item_id);
    if (!rawItem || !isCountableOrigin(rawItem.origin_type)) continue;

    const source = sourcesById.get(rawItem.source_id);
    if (!source || !passesTierGate(source.discovery_tier)) continue;

    const value = asClaimValue(claim.value);
    const count = numericCount(value);
    if (count === null) continue;

    const counterKey = counterKeyForClaim(claim.claim_type, value);
    if (!counterKey) continue;

    upsertGroup(groups, counterKey, claim.date_occurred, count, source.id);
  }

  // counter_snapshots is derived state owned by this step: clear and rewrite so
  // reruns reflect current claims without duplicate or stale snapshot rows.
  await clearCounterSnapshots(db);

  const rows = snapshotRows(groups);
  if (rows.length === 0) return;

  const { error: insertError } = await db.from('counter_snapshots').insert(rows);
  if (insertError) throw insertError;
}
