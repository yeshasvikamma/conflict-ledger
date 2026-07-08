// =============================================================================
// scripts/reset_db.ts — wipe all tables for a clean slate
// =============================================================================
// Deletes rows in FK-safe order (children first). Use during dev, or right
// before the live demo to reset to a known state, then `pnpm run seed`.
//
// NOTE: this does not DROP tables or touch schema — it only clears data.
// =============================================================================

import 'dotenv/config';
import { serviceClient } from '../shared/supabaseClient.ts';

const db = serviceClient();

// Child tables before parents to respect foreign keys.
const TABLES_IN_ORDER = [
  'event_claims',
  'claim_entities',
  'counter_snapshots',
  'zones',
  'claims',
  'events',
  'entities',
  'raw_items',
  'sources',
];

async function reset(): Promise<void> {
  for (const table of TABLES_IN_ORDER) {
    // Delete everything. The neq on a never-matching uuid matches all rows.
    const { error } = await db
      .from(table)
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) {
      // event_claims / claim_entities have no `id` column; fall back to a broad delete.
      const { error: fallbackErr } = await db.from(table).delete().gte('claim_id', '');
      if (fallbackErr) {
        console.warn(`[reset_db] could not clear ${table}: ${error.message}`);
      } else {
        console.log(`[reset_db] cleared ${table}`);
      }
    } else {
      console.log(`[reset_db] cleared ${table}`);
    }
  }
  console.log('[reset_db] done.');
}

reset()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[reset_db] FAILED:', err);
    process.exit(1);
  });
