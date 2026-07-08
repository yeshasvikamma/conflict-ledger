// =============================================================================
// tiering/run.ts — poll untiered sources, tier them  [Person B]
// =============================================================================
// Polls sources where discovery_tier IS NULL, tiers each via decideTier(),
// writes discovery_tier + tier_reason. Idempotent: the IS NULL filter means
// already-tiered rows are never re-processed (see tiering.test.ts T3).
//
// Owns writes to: sources (update discovery_tier, tier_reason) — ONLY those columns.
//
// Run:  pnpm run tier
// =============================================================================

import 'dotenv/config';
import { serviceClient } from '../shared/supabaseClient.ts';

const db = serviceClient();

async function runTiering(): Promise<void> {
  // TODO(Person B):
  //   1. select id, domain from sources where discovery_tier is null
  //   2. for each: const { tier, reason } = decideTier(domain)
  //   3. update sources set discovery_tier=tier, tier_reason=reason where id=...
  //   Only touch discovery_tier + tier_reason. Never other columns.
  void db;
  console.log('[tiering] run.ts not implemented — see tiering/AGENT.md');
}

runTiering()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[tiering] FAILED:', err);
    process.exit(1);
  });
