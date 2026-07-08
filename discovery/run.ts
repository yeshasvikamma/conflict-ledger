// =============================================================================
// discovery/run.ts — entrypoint, one full discovery cycle  [Person A]
// =============================================================================
// Orchestrates: for each query -> serp -> for each new URL -> insert source if
// new -> scrape -> upsert raw_items (on conflict do nothing on url).
//
// Owns writes to: sources (insert), raw_items (insert).
// Does NOT touch: discovery_tier, tier_reason (Person B), anything in /pipeline.
//
// Run:  pnpm run discovery
// =============================================================================

import 'dotenv/config';
import { serviceClient } from '../shared/supabaseClient.ts';
import queries from './queries.json' with { type: 'json' };

const db = serviceClient();

async function runCycle(): Promise<void> {
  const allQueries = [...queries.narrative, ...queries.institutional];
  console.log(`[discovery] starting cycle over ${allQueries.length} queries`);

  // TODO(Person A): implement the full loop.
  //   for (const query of allQueries) {
  //     const results = await serpSearch(query);
  //     for (const r of results) {
  //       // 1. check if r.domain exists in sources; insert if new,
  //       //    discovered_via = query (EXACT string)
  //       // 2. scrapeUrl(r.url)
  //       // 3. upsert into raw_items on conflict (url) do nothing,
  //       //    origin_type = 'search_discovered'
  //     }
  //   }
  //   Then also pull CPJ once per cycle via fetchCpj() and insert with
  //   source_type + origin_type = 'institutional_direct', discovered_via='direct:cpj'.

  void db;
  console.log('[discovery] run.ts not implemented — see discovery/AGENT.md');
}

runCycle()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[discovery] FAILED:', err);
    process.exit(1);
  });
