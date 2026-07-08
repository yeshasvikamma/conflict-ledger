// =============================================================================
// tiering/tiering.test.ts  [Person B]
// =============================================================================
// The three tiering tests that define "done" (PRD §10). Start as .todo; convert
// to real tests as you implement.
// =============================================================================

import { describe, it } from 'vitest';

describe('tiering', () => {
  // T1: a domain present in ratings_cache.json gets the correct tier written,
  // and tier_reason is non-null + human-readable.
  it.todo('T1: cached domain -> correct tier + human-readable reason');

  // T2: a domain absent from the cache defaults to emerging_unverified, with
  // tier_reason stating "not found in reliability dataset".
  it.todo('T2: uncached domain -> emerging_unverified + reason');

  // T3: running the tiering pass twice does not re-process already-tiered rows
  // (idempotency via the discovery_tier IS NULL filter).
  it.todo('T3: idempotent — already-tiered rows are not re-processed');
});
