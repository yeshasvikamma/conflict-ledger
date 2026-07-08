// =============================================================================
// api/counters.ts — /counters + /counters/:key/breakdown  [Person C]  (Tier A)
// =============================================================================
// Thin read endpoints over counter_snapshots + claims. The hard work already
// happened in the pipeline; these are just queries + JSON.
// =============================================================================

import type { Request, Response } from 'express';
import {
  CLAIM_TYPES,
  COUNTABLE_TIERS,
  ORIGIN_TYPE,
  isCountableTier,
} from '../shared/constants.ts';
import { anonClient } from '../shared/supabaseClient.ts';
import type { Database, Json } from '../shared/types.ts';

const [JOURNALIST_KILLED_CLAIM_TYPE, CASUALTY_COUNT_CLAIM_TYPE] = CLAIM_TYPES;
const [SEARCH_DISCOVERED_ORIGIN_TYPE, INSTITUTIONAL_DIRECT_ORIGIN_TYPE] = ORIGIN_TYPE;
const COUNTABLE_TIER_NAMES = new Set<string>(COUNTABLE_TIERS);
const COUNTABLE_ORIGIN_TYPES = new Set<string>([
  SEARCH_DISCOVERED_ORIGIN_TYPE,
  INSTITUTIONAL_DIRECT_ORIGIN_TYPE,
]);

const JOURNALISTS_KILLED_COUNTER = 'journalists_killed';
const PALESTINIANS_KILLED_COUNTER = 'palestinians_killed';
const ISRAELIS_KILLED_COUNTER = 'israelis_killed';
const CHILDREN_KILLED_COUNTER = 'children_killed';

type ApiDb = Pick<ReturnType<typeof anonClient>, 'from'>;
type CounterSnapshotRow = Database['public']['Tables']['counter_snapshots']['Row'];
type ClaimRow = Pick<
  Database['public']['Tables']['claims']['Row'],
  'id' | 'raw_item_id' | 'claim_type' | 'value' | 'raw_quote' | 'date_occurred'
>;
type RawItemRow = Pick<
  Database['public']['Tables']['raw_items']['Row'],
  'id' | 'source_id' | 'origin_type' | 'url'
>;
type SourceRow = Pick<
  Database['public']['Tables']['sources']['Row'],
  'id' | 'name' | 'domain' | 'discovery_tier'
>;

type ClaimValue = {
  count?: unknown;
  group?: unknown;
  subtype?: unknown;
};

type CounterResponse = Pick<
  CounterSnapshotRow,
  | 'counter_key'
  | 'low_value'
  | 'high_value'
  | 'as_of_date'
  | 'primary_source_ids'
  | 'claim_count'
>;

type BreakdownClaim = {
  value: Json;
  raw_quote: string;
  source: {
    name: string | null;
    tier: string | null;
    domain: string;
  };
  url: string;
  date: string | null;
};

let dbForTest: ApiDb | null = null;

export function setCountersDbForTest(db: ApiDb | null): void {
  dbForTest = db;
}

function db(): ApiDb {
  return dbForTest ?? anonClient();
}

function asClaimValue(value: Json): ClaimValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as ClaimValue;
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

function isCountableOrigin(originType: string): boolean {
  return COUNTABLE_ORIGIN_TYPES.has(originType);
}

function passesTierGate(tier: string | null): boolean {
  return isCountableTier(tier) && !!tier && COUNTABLE_TIER_NAMES.has(tier);
}

function latestCounters(rows: CounterSnapshotRow[]): CounterResponse[] {
  const latestByKey = new Map<string, CounterSnapshotRow>();

  for (const row of rows) {
    const existing = latestByKey.get(row.counter_key);
    if (
      !existing ||
      row.as_of_date > existing.as_of_date ||
      (row.as_of_date === existing.as_of_date && row.computed_at > existing.computed_at)
    ) {
      latestByKey.set(row.counter_key, row);
    }
  }

  return [...latestByKey.values()]
    .map(
      ({
        counter_key,
        low_value,
        high_value,
        as_of_date,
        primary_source_ids,
        claim_count,
      }) => ({
        counter_key,
        low_value,
        high_value,
        as_of_date,
        primary_source_ids,
        claim_count,
      }),
    )
    .sort((a, b) => a.counter_key.localeCompare(b.counter_key));
}

/**
 * GET /counters
 * -> [{counter_key, low_value, high_value, as_of_date, primary_source_ids, claim_count}]
 * One row per counter (latest snapshot per counter_key). Always a range.
 *
 * TODO(Person C): select latest counter_snapshots grouped by counter_key.
 */
export async function getCounters(_req: Request, res: Response): Promise<void> {
  const { data, error } = await db()
    .from('counter_snapshots')
    .select(
      'counter_key, low_value, high_value, as_of_date, primary_source_ids, claim_count, computed_at',
    );

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(latestCounters((data ?? []) as CounterSnapshotRow[]));
}

/**
 * GET /counters/:key/breakdown
 * -> {counter, claims: [{value, raw_quote, source: {name, tier, domain}, url, date}]}
 * Every sourced claim behind a counter. The credibility drilldown.
 *
 * TODO(Person C): join claims -> raw_items -> sources for counter_key = :key,
 * filtered to COUNTABLE_TIERS (same gate as snapshots).
 */
export async function getCounterBreakdown(req: Request, res: Response): Promise<void> {
  const counter = req.params.key ?? '';
  const apiDb = db();
  const { data: claimData, error: claimError } = await apiDb
    .from('claims')
    .select('id, raw_item_id, claim_type, value, raw_quote, date_occurred')
    .in('claim_type', [JOURNALIST_KILLED_CLAIM_TYPE, CASUALTY_COUNT_CLAIM_TYPE]);

  if (claimError) {
    res.status(500).json({ error: claimError.message });
    return;
  }

  const claims = (claimData ?? []) as ClaimRow[];
  const rawItemIds = [...new Set(claims.map((claim) => claim.raw_item_id))];
  const rawItemsById = new Map<string, RawItemRow>();

  if (rawItemIds.length > 0) {
    const { data: rawItemData, error: rawItemError } = await apiDb
      .from('raw_items')
      .select('id, source_id, origin_type, url')
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

  const breakdown: BreakdownClaim[] = [];
  for (const claim of claims) {
    if (counterKeyForClaim(claim.claim_type, asClaimValue(claim.value)) !== counter) {
      continue;
    }

    const rawItem = rawItemsById.get(claim.raw_item_id);
    if (!rawItem || !isCountableOrigin(rawItem.origin_type)) continue;

    const source = sourcesById.get(rawItem.source_id);
    if (!source || !passesTierGate(source.discovery_tier)) continue;

    breakdown.push({
      value: claim.value,
      raw_quote: claim.raw_quote,
      source: {
        name: source.name,
        tier: source.discovery_tier,
        domain: source.domain,
      },
      url: rawItem.url,
      date: claim.date_occurred,
    });
  }

  res.json({
    counter,
    claims: breakdown.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')),
  });
}
