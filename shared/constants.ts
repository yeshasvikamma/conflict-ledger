// =============================================================================
// Live Conflict Ledger — Shared Constants (FROZEN CONTRACT)
// =============================================================================
// These enums are the ONE seam where a typo silently breaks the whole chain.
// EVERY track imports from here. NOBODY hand-types 'established' / 'x' / etc.
// as a bare string literal anywhere in their own code.
//
// FROZEN: heads-up to the team in chat before changing. If you add a value,
// it must also be reflected in schema.sql comments and claim_types.md.
// =============================================================================

// Trust tiers assigned to a source. Order is roughly most→least trustworthy.
export const DISCOVERY_TIER = [
  'institutional',
  'wire_service',
  'established',
  'emerging_unverified',
] as const;
export type DiscoveryTier = (typeof DISCOVERY_TIER)[number];

// How a raw_item entered the system.
export const ORIGIN_TYPE = [
  'search_discovered', // Person A: found via Bright Data SERP + scraped
  'institutional_direct', // Person A: the deliberate CPJ direct pull
  'x', // Person B: pulled from X via Grok — signal only, never counted
] as const;
export type OriginType = (typeof ORIGIN_TYPE)[number];

// Shape of a raw_item's text, decides which extraction prompt Person C uses.
export const CONTENT_SHAPE = ['prose', 'structured', 'unknown'] as const;
export type ContentShape = (typeof CONTENT_SHAPE)[number];

// The kinds of facts we extract. Tier A implements ONLY the first two.
// The rest are defined now so schema/logic never change shape, but are Tier B.
export const CLAIM_TYPES = [
  'journalist_killed', // Tier A
  'casualty_count', // Tier A
  'aid_worker_killed', // Tier B
  'hostage_status', // Tier B
  'wounded_count', // Tier B
  'displacement', // Tier B
  'strike', // Tier B (map only, no counter)
] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

// THE TIER GATE. Only claims whose source sits in one of these tiers count
// toward a counter. Applied in exactly one place: snapshots.ts (Person C).
// 'emerging_unverified' and anything origin_type='x' are excluded by construction.
export const COUNTABLE_TIERS = [
  'institutional',
  'wire_service',
  'established',
] as const;
export type CountableTier = (typeof COUNTABLE_TIERS)[number];

// Entity subtypes (Tier B).
export const ENTITY_TYPE = ['person', 'place', 'org'] as const;
export type EntityType = (typeof ENTITY_TYPE)[number];

// Zone types (Tier B map layer).
export const ZONE_TYPE = ['under_attack', 'evacuation_order'] as const;
export type ZoneType = (typeof ZONE_TYPE)[number];

// Event categories (Tier B).
export const EVENT_CATEGORY = [
  'strike',
  'casualty',
  'journalist',
  'hostage',
  'displacement',
  'aid',
] as const;
export type EventCategory = (typeof EVENT_CATEGORY)[number];

// Convenience: is a given tier countable? Use this instead of re-deriving.
export function isCountableTier(tier: string | null | undefined): boolean {
  return !!tier && (COUNTABLE_TIERS as readonly string[]).includes(tier);
}
