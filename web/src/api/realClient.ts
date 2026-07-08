import type {
  CounterBreakdown,
  CounterBreakdownClaim,
  CounterSnapshot,
  SourceRating,
  SourceSummary,
} from './types';

const DEFAULT_API_BASE = 'http://localhost:8787';
const API_BASE = (import.meta.env.VITE_API_BASE ?? DEFAULT_API_BASE).replace(
  /\/+$/,
  '',
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'string' && item.length > 0)
  );
}

function asCounterSnapshot(row: unknown): CounterSnapshot | null {
  if (!isRecord(row)) return null;
  if (
    typeof row.counter_key !== 'string' ||
    typeof row.low_value !== 'number' ||
    typeof row.high_value !== 'number' ||
    typeof row.as_of_date !== 'string' ||
    !isStringArray(row.primary_source_ids) ||
    typeof row.claim_count !== 'number'
  ) {
    return null;
  }

  return {
    counter_key: row.counter_key,
    low_value: row.low_value,
    high_value: row.high_value,
    as_of_date: row.as_of_date,
    primary_source_ids: row.primary_source_ids,
    claim_count: row.claim_count,
  };
}

function asBreakdownClaim(claim: unknown): CounterBreakdownClaim | null {
  if (!isRecord(claim)) return null;
  if (
    !isRecord(claim.value) ||
    typeof claim.raw_quote !== 'string' ||
    !isRecord(claim.source) ||
    typeof claim.source.name !== 'string' ||
    typeof claim.source.tier !== 'string' ||
    typeof claim.source.domain !== 'string' ||
    typeof claim.url !== 'string' ||
    typeof claim.date !== 'string'
  ) {
    return null;
  }

  return {
    value: claim.value,
    raw_quote: claim.raw_quote,
    source: {
      name: claim.source.name,
      tier: claim.source.tier,
      domain: claim.source.domain,
    },
    url: claim.url,
    date: claim.date,
  };
}

function asSourceRating(rating: unknown): SourceRating | null {
  if (!isRecord(rating)) return null;
  if (
    typeof rating.reliability !== 'string' ||
    typeof rating.lean !== 'string' ||
    typeof rating.methodology_url !== 'string'
  ) {
    return null;
  }

  return {
    reliability: rating.reliability,
    lean: rating.lean,
    methodology_url: rating.methodology_url,
  };
}

function asSourceSummary(row: unknown): SourceSummary | null {
  if (!isRecord(row)) return null;
  if (
    typeof row.domain !== 'string' ||
    typeof row.name !== 'string' ||
    typeof row.tier !== 'string' ||
    typeof row.tier_reason !== 'string'
  ) {
    return null;
  }

  return {
    domain: row.domain,
    name: row.name,
    tier: row.tier,
    tier_reason: row.tier_reason,
    rating: row.rating === null ? null : asSourceRating(row.rating),
  };
}

async function fetchJson(path: string): Promise<unknown> {
  try {
    const response = await fetch(`${API_BASE}${path}`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function getCounters(): Promise<CounterSnapshot[]> {
  const payload = await fetchJson('/counters');
  if (!Array.isArray(payload)) return [];

  return payload
    .map((row) => asCounterSnapshot(row))
    .filter((row): row is CounterSnapshot => row !== null);
}

export async function getCounterBreakdown(
  key: string,
): Promise<CounterBreakdown | null> {
  const payload = await fetchJson(`/counters/${encodeURIComponent(key)}/breakdown`);
  if (!isRecord(payload)) return null;
  if (typeof payload.counter !== 'string' || !Array.isArray(payload.claims)) {
    return null;
  }

  const claims = payload.claims
    .map((claim) => asBreakdownClaim(claim))
    .filter((claim): claim is CounterBreakdownClaim => claim !== null);

  return {
    counter: payload.counter,
    claims,
  };
}

export async function getSources(): Promise<SourceSummary[]> {
  const payload = await fetchJson('/sources');
  if (!Array.isArray(payload)) return [];

  return payload
    .map((row) => asSourceSummary(row))
    .filter((row): row is SourceSummary => row !== null);
}
