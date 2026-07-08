// =============================================================================
// pipeline/zones.ts — emit attack/evacuation zones from prose  [Person C]  (Tier B)
// =============================================================================
// When the extractor detects evacuation-order or "strikes across X region"
// language, emit a zones row for the map's zone layer. Explicitly labeled as
// REPORTED-from-prose, NOT an authoritative territorial-control map.
//
// Tier B ONLY. Do not build until Tier A is green.
// =============================================================================

/**
 * Detect + insert zone rows from a raw_item's text.
 *
 * TODO(Person C, Tier B):
 *   - detect evacuation-order / area-under-attack language
 *   - insert zones row: zone_type, region, date_observed, source_id, raw_quote
 *   - keep raw_quote so every zone traces back to its sentence
 */
export async function emitZones(): Promise<void> {
  throw new Error('emitZones not implemented (Tier B) — see pipeline/AGENT.md');
}
