// =============================================================================
// signal/run.ts — pull X signal, insert tagged rows  [Person B]
// =============================================================================
// Owns writes to: sources (insert, source_type='x'), raw_items (insert, origin_type='x').
//
// Run:  pnpm run signal
// =============================================================================

import 'dotenv/config';
import { serviceClient } from '../shared/supabaseClient.ts';

const db = serviceClient();

async function runSignal(): Promise<void> {
  // TODO(Person B):
  //   - pick a few queries (can reuse discovery narrative queries)
  //   - for each: grokSearch(query)
  //   - upsert a source row per author-domain-ish key with source_type='x'
  //   - upsert raw_items with origin_type='x' (dedup on url)
  //   Everything here is signal-only; it must never be countable.
  void db;
  console.log('[signal] run.ts not implemented — see signal/AGENT.md');
}

runSignal()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[signal] FAILED:', err);
    process.exit(1);
  });
