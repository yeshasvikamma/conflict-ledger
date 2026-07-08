// =============================================================================
// pipeline/geocode.ts — location string -> lat/lng  [Person C]  (Tier B)
// =============================================================================
// Uses Nominatim / OpenStreetMap (free, no API key). Powers the map. Store
// geo_confidence so the frontend can down-weight fuzzy hits.
//
// Tier B ONLY. Do not build until Tier A is green.
// =============================================================================

export interface GeoResult {
  lat: number;
  lng: number;
  confidence: number; // 0..1
}

/**
 * Geocode a free-text location via Nominatim.
 *
 * TODO(Person C, Tier B):
 *   - GET https://nominatim.openstreetmap.org/search?q=...&format=json
 *   - respect their usage policy (set a User-Agent, cache, don't hammer)
 *   - return best hit as GeoResult, or null if none
 */
export async function geocode(location: string): Promise<GeoResult | null> {
  void location;
  throw new Error('geocode not implemented (Tier B) — see pipeline/AGENT.md');
}
