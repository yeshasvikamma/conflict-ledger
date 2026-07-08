// =============================================================================
// discovery/cpj.ts — CPJ direct pull  [Person A]
// =============================================================================
// ⚠️  DELIBERATE EXCEPTION TO "NO HARDCODED SOURCES" ⚠️
//
// Every other source in this system is discovered dynamically via Bright Data
// SERP — nothing is hardcoded. This file is the ONE intentional exception: a
// direct pull from the Committee to Protect Journalists' own published data on
// journalists killed.
//
// WHY this exception is justified:
//   1. CPJ publishes structured, primary-source data — far more reliable to
//      extract from than narrative news prose.
//   2. The demo's flagship counter (journalists_killed) depends on this number
//      being right, so anchoring it to the authoritative primary source is worth
//      the one deviation from the discovery-only principle.
//   3. It is clearly labeled: source_type='institutional_direct',
//      origin_type='institutional_direct', discovered_via='direct:cpj' — so it
//      is always distinguishable from dynamically discovered sources.
//
// This is the only place in the codebase permitted to name a specific source.
// =============================================================================

import type { ScrapeResult } from './scrape.ts';

/**
 * Pull CPJ's published journalist-casualty data.
 *
 * TODO(Person A):
 *   - Fetch CPJ's data (their site / published dataset).
 *   - Return it as one or more ScrapeResult-shaped items so run.ts can insert
 *     them with source_type + origin_type = 'institutional_direct' and
 *     discovered_via = 'direct:cpj'.
 *   - If the structure is tabular, that's fine — Person C's extractor detects
 *     content_shape='structured' and handles it. You just deliver the text.
 */
export async function fetchCpj(): Promise<ScrapeResult[]> {
  throw new Error('fetchCpj not implemented — see discovery/AGENT.md');
}
