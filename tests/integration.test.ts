// =============================================================================
// tests/integration.test.ts — full-chain test, run before each checkpoint
// =============================================================================
// Proves the tracks compose. Kept as .todo until the pieces exist; wire it up
// once discovery (mocked), tiering, and pipeline can run against a test DB.
//
// The chain: seed -> discovery (MOCKED SERP/Unlocker, not live) -> tiering ->
// pipeline -> assert the invariants below hold.
// =============================================================================

import 'dotenv/config';
import { describe, expect, it } from 'vitest';
import { COUNTABLE_TIERS } from '../shared/constants.ts';
import { serviceClient } from '../shared/supabaseClient.ts';

const hasSupabaseCredentials = Boolean(
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

if (!hasSupabaseCredentials) {
  console.warn('[integration] skipping — no Supabase credentials in environment');
}

const integrationIt = it.skipIf(!hasSupabaseCredentials);

describe('integration (full chain)', () => {
  // Invariant 1: every sources row has non-null discovered_via.
  integrationIt('every source has discovered_via', async () => {
    const db = serviceClient();
    const { data, error } = await db
      .from('sources')
      .select('id, domain, discovered_via');

    if (error) throw error;

    const missing = (data ?? []).filter(
      (source) => !source.discovered_via?.trim(),
    );

    expect(
      missing.map((source) => `${source.id}:${source.domain}`),
      'sources missing discovered_via',
    ).toEqual([]);
  });

  // Invariant 2: every claims.raw_quote is a verbatim substring of its raw_text.
  integrationIt('100% of claims have verbatim raw_quote', async () => {
    const db = serviceClient();
    const { data: claims, error: claimsError } = await db
      .from('claims')
      .select('id, raw_item_id, raw_quote');

    if (claimsError) throw claimsError;

    const rawItemIds = Array.from(
      new Set((claims ?? []).map((claim) => claim.raw_item_id)),
    );
    const rawTextById = new Map<string, string>();

    if (rawItemIds.length > 0) {
      const { data: rawItems, error: rawItemsError } = await db
        .from('raw_items')
        .select('id, raw_text')
        .in('id', rawItemIds);

      if (rawItemsError) throw rawItemsError;

      for (const rawItem of rawItems ?? []) {
        rawTextById.set(rawItem.id, rawItem.raw_text);
      }
    }

    const violatingClaimIds = (claims ?? [])
      .filter((claim) => {
        const rawText = rawTextById.get(claim.raw_item_id);
        return !rawText || !rawText.includes(claim.raw_quote);
      })
      .map((claim) => claim.id);

    expect(
      violatingClaimIds,
      `claims with raw_quote not found verbatim in parent raw_text: ${violatingClaimIds.join(
        ', ',
      )}`,
    ).toEqual([]);
  });

  // Invariant 3: no two raw_items share a url.
  integrationIt('no duplicate raw_items.url', async () => {
    const db = serviceClient();
    const { data, error } = await db.from('raw_items').select('id, url');

    if (error) throw error;

    const idsByUrl = new Map<string, string[]>();
    for (const rawItem of data ?? []) {
      idsByUrl.set(rawItem.url, [...(idsByUrl.get(rawItem.url) ?? []), rawItem.id]);
    }

    const duplicates = Array.from(idsByUrl.entries())
      .filter(([, ids]) => ids.length > 1)
      .map(([url, ids]) => `${url}: ${ids.join(', ')}`);

    expect(duplicates, 'duplicate raw_items.url rows').toEqual([]);
  });

  // Invariant 4: at least one event has has_disagreement = true.
  integrationIt('at least one disagreement event exists', async () => {
    const db = serviceClient();
    const { data: events, error: eventsError } = await db
      .from('events')
      .select('id')
      .eq('has_disagreement', true);

    if (eventsError) throw eventsError;

    expect(events?.length ?? 0, 'events with has_disagreement=true').toBeGreaterThan(
      0,
    );

    const checkedEventIds: string[] = [];
    for (const event of events ?? []) {
      checkedEventIds.push(event.id);

      const { data: links, error: linksError } = await db
        .from('event_claims')
        .select('claim_id')
        .eq('event_id', event.id);

      if (linksError) throw linksError;

      const claimIds = (links ?? []).map((link) => link.claim_id);
      if (claimIds.length < 2) {
        continue;
      }

      const { data: claims, error: claimsError } = await db
        .from('claims')
        .select('id, claim_type, value')
        .in('id', claimIds);

      if (claimsError) throw claimsError;

      if (hasDifferentCountsForSameClaimType(claims ?? [])) {
        return;
      }
    }

    expect.fail(
      `no disagreement event had at least two linked claims with different value.count for the same claim_type; checked event ids: ${checkedEventIds.join(
        ', ',
      )}`,
    );
  });

  // Invariant 5: counters reflect ONLY COUNTABLE_TIERS (no x, no emerging_unverified).
  integrationIt('counters exclude x-origin and emerging_unverified sources', async () => {
    const db = serviceClient();
    const { data: snapshots, error: snapshotsError } = await db
      .from('counter_snapshots')
      .select('id, primary_source_ids');

    if (snapshotsError) throw snapshotsError;

    const sourceIds = Array.from(
      new Set((snapshots ?? []).flatMap((snapshot) => snapshot.primary_source_ids ?? [])),
    );
    const sourceById = new Map<
      string,
      { discovery_tier: string | null; domain: string }
    >();

    if (sourceIds.length > 0) {
      const { data: sources, error: sourcesError } = await db
        .from('sources')
        .select('id, domain, discovery_tier')
        .in('id', sourceIds);

      if (sourcesError) throw sourcesError;

      for (const source of sources ?? []) {
        sourceById.set(source.id, {
          discovery_tier: source.discovery_tier,
          domain: source.domain,
        });
      }
    }

    const violations: string[] = [];
    for (const snapshot of snapshots ?? []) {
      for (const sourceId of snapshot.primary_source_ids ?? []) {
        const source = sourceById.get(sourceId);
        if (!source) {
          violations.push(`${snapshot.id}:${sourceId}:missing source`);
          continue;
        }

        if (!(COUNTABLE_TIERS as readonly string[]).includes(source.discovery_tier ?? '')) {
          violations.push(
            `${snapshot.id}:${source.domain}:${source.discovery_tier ?? 'null'}`,
          );
        }
      }
    }

    expect(
      violations,
      `counter_snapshots referenced non-countable sources: ${violations.join(', ')}`,
    ).toEqual([]);
  });
});

type ClaimWithValue = {
  claim_type: string;
  value: unknown;
};

function hasDifferentCountsForSameClaimType(claims: ClaimWithValue[]): boolean {
  const countsByClaimType = new Map<string, Set<string>>();

  for (const claim of claims) {
    const count = countFromValue(claim.value);
    if (count === null) {
      continue;
    }

    const counts = countsByClaimType.get(claim.claim_type) ?? new Set<string>();
    counts.add(count);
    countsByClaimType.set(claim.claim_type, counts);
  }

  return Array.from(countsByClaimType.values()).some((counts) => counts.size >= 2);
}

function countFromValue(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('count' in value)) {
    return null;
  }

  const count = (value as { count: unknown }).count;
  return count === null || count === undefined ? null : String(count);
}
