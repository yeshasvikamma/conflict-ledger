// =============================================================================
// discovery/discovery.test.ts  [Person A]
// =============================================================================
// The four tests that define "done" for the discovery track. They start as
// `.todo` so the suite is green on a fresh clone; convert each to a real
// `it(...)` as you implement. All four must be real and passing before this
// track is done (PRD §9).
// =============================================================================

import { describe, it } from 'vitest';

describe('discovery', () => {
  // T1: upsert-on-url dedup — running twice against the same mocked SERP
  // response inserts ZERO duplicate raw_items rows.
  it.todo('T1: does not insert duplicate raw_items for the same URL (upsert on url)');

  // T2: a new domain is inserted into sources with discovered_via = the EXACT
  // query string, and discovery_tier is null (not this track's job to tier).
  it.todo('T2: new domain inserted with discovered_via = exact query, tier null');

  // T3: cpj.ts output produces source_type = 'institutional_direct' and
  // raw_items.origin_type = 'institutional_direct'.
  it.todo('T3: CPJ pull tagged institutional_direct on both source and raw_item');

  // T4: a simulated 429 from the mocked Bright Data client triggers retry with
  // backoff (assert retry count), not a crash.
  it.todo('T4: 429 triggers backoff+retry, not a crash');
});
