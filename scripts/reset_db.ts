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
import type { Database } from '../shared/types.ts';

const db = serviceClient();
type TableName = keyof Database['public']['Tables'];
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

// Child tables before parents to respect foreign keys.
const TABLES_IN_ORDER: TableName[] = [
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

const DELETE_FILTER_COLUMN: Record<TableName, string> = {
  event_claims: 'claim_id',
  claim_entities: 'claim_id',
  counter_snapshots: 'id',
  zones: 'id',
  claims: 'id',
  events: 'id',
  entities: 'id',
  raw_items: 'id',
  sources: 'id',
};

async function reset(): Promise<void> {
  for (const table of TABLES_IN_ORDER) {
    // Delete everything. The neq on a valid, never-matching uuid matches all rows.
    const filterColumn = DELETE_FILTER_COLUMN[table];
    const { error } = await db.from(table).delete().neq(filterColumn, ZERO_UUID);
    if (error) {
      console.warn(`[reset_db] could not clear ${table}: ${error.message}`);
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
