// =============================================================================
// discovery/serp.ts — Bright Data SERP API  [Person A]
// =============================================================================
// Calls Bright Data's SERP API for ONE query, returns a list of results.
// No hardcoded domains anywhere. See AGENT.md in this folder for the full spec.
// =============================================================================

export interface SerpResult {
  url: string;
  domain: string;
  title: string;
}

/**
 * Run one SERP query via Bright Data and return the organic results.
 *
 * TODO(Person A):
 *   - Read BRIGHTDATA_API_KEY from env.
 *   - Call the Bright Data SERP endpoint for `query`.
 *   - Parse organic results into SerpResult[] (extract domain from URL).
 *   - Return [] on no results; let scrape.ts handle per-URL fetching.
 */
export async function serpSearch(query: string): Promise<SerpResult[]> {
  void query;
  throw new Error('serpSearch not implemented — see discovery/AGENT.md');
}
