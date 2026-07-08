// =============================================================================
// tiering/run.ts — poll untiered sources, tier them  [Person B]
// =============================================================================
// Polls sources where discovery_tier IS NULL, tiers each via tierDomain(),
// writes discovery_tier + tier_reason. Idempotent: the IS NULL filter means
// already-tiered rows are never re-processed (see tiering.test.ts T4).
//
// Owns writes to: sources (update discovery_tier, tier_reason) — ONLY those columns.
//
// Run:  pnpm run tier
// =============================================================================

import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { serviceClient } from '../shared/supabaseClient.ts';
import type { Database } from '../shared/types.ts';
import { tierDomain, type TierDecision } from './tier.ts';

type TieringClient = ReturnType<typeof serviceClient>;
type SourceRow = Pick<Database['public']['Tables']['sources']['Row'], 'domain' | 'id'>;
type Tierer = (domain: string) => TierDecision;

function intervalMs(): number {
  const seconds = Number.parseInt(process.env.DISCOVERY_INTERVAL_SECONDS ?? '30', 10);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error('DISCOVERY_INTERVAL_SECONDS must be a positive number of seconds');
  }

  return seconds * 1000;
}

export async function runTieringOnce(
  db: TieringClient = serviceClient(),
  tierer: Tierer = tierDomain,
): Promise<void> {
  const { data, error } = await db
    .from('sources')
    .select('id, domain')
    .is('discovery_tier', null);

  if (error) {
    throw new Error(`[tiering] failed to fetch untiered sources: ${error.message}`);
  }

  const sources: SourceRow[] = data ?? [];

  for (const source of sources) {
    const { tier, reason } = tierer(source.domain);

    console.log(`[tiering] ${source.domain} -> ${tier}: ${reason}`);

    const { error: updateError } = await db
      .from('sources')
      .update({
        discovery_tier: tier,
        tier_reason: reason,
      })
      .eq('id', source.id);

    if (updateError) {
      throw new Error(
        `[tiering] failed to update ${source.domain}: ${updateError.message}`,
      );
    }
  }
}

export async function startTieringPolling(): Promise<NodeJS.Timeout> {
  await runTieringOnce();

  return setInterval(() => {
    runTieringOnce().catch((err: unknown) => {
      console.error('[tiering] poll failed:', err);
    });
  }, intervalMs());
}

function isDirectRun(): boolean {
  return process.argv[1]
    ? import.meta.url === pathToFileURL(process.argv[1]).href
    : false;
}

if (isDirectRun()) {
  startTieringPolling().catch((err: unknown) => {
    console.error('[tiering] FAILED:', err);
    process.exit(1);
  });
}
