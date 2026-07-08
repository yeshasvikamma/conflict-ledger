// =============================================================================
// tests/integration.test.ts — full-chain test, run before each checkpoint
// =============================================================================
// Proves the tracks compose. Kept as .todo until the pieces exist; wire it up
// once discovery (mocked), tiering, and pipeline can run against a test DB.
//
// The chain: seed -> discovery (MOCKED SERP/Unlocker, not live) -> tiering ->
// pipeline -> assert the invariants below hold.
// =============================================================================

import { describe, it } from 'vitest';

describe('integration (full chain)', () => {
  // Invariant 1: every sources row has non-null discovered_via.
  it.todo('every source has discovered_via');

  // Invariant 2: every claims.raw_quote is a verbatim substring of its raw_text.
  it.todo('100% of claims have verbatim raw_quote');

  // Invariant 3: no two raw_items share a url.
  it.todo('no duplicate raw_items.url');

  // Invariant 4: at least one event has has_disagreement = true.
  it.todo('at least one disagreement event exists');

  // Invariant 5: counters reflect ONLY COUNTABLE_TIERS (no x, no emerging_unverified).
  it.todo('counters exclude x-origin and emerging_unverified sources');
});
