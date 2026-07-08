// =============================================================================
// tiering/tier.ts — deterministic source tiering  [Person B]
// =============================================================================
// Given a domain, decide its trust tier. FULLY DETERMINISTIC — no LLM call here
// (reproducibility + auditability). See tiering/AGENT.md for the full spec.
// =============================================================================

import ratingsCache from './ratings_cache.json';
import { DISCOVERY_TIER, type DiscoveryTier } from '../shared/constants.ts';

export interface TierDecision {
  tier: DiscoveryTier;
  reason: string; // human-readable — this doubles as the methodology note for judges
}

type RatingEntry = {
  reliability: string;
  lean: string;
  methodology_url: string;
};

const [, WIRE_SERVICE_TIER, ESTABLISHED_TIER, EMERGING_UNVERIFIED_TIER] =
  DISCOVERY_TIER;

export const WIRE_AGENCIES = [
  'ap.org',
  'reuters.com',
  'afp.com',
  'bbc.com',
  'aljazeera.com',
] as const;

const RATINGS_CACHE = ratingsCache as Record<string, RatingEntry>;

function normalizeDomain(domain: string): string {
  const markdownLinkTarget = domain.match(/\]\(([^)]+)\)/)?.[1];
  const rawDomain = (markdownLinkTarget ?? domain).trim().toLowerCase();
  const withProtocol = /^[a-z]+:\/\//i.test(rawDomain)
    ? rawDomain
    : `https://${rawDomain}`;

  try {
    return new URL(withProtocol).hostname.replace(/\.$/, '').replace(/^www\./, '');
  } catch {
    return rawDomain
      .replace(/^[a-z]+:\/\//i, '')
      .split('/')[0]
      .split(':')[0]
      .replace(/\.$/, '')
      .replace(/^www\./, '');
  }
}

function matchWireAgency(domain: string): (typeof WIRE_AGENCIES)[number] | undefined {
  return WIRE_AGENCIES.find(
    (wireDomain) => domain === wireDomain || domain.endsWith(`.${wireDomain}`),
  );
}

/**
 * Decide a tier for a domain.
 *
 * Logic order is fixed: wire agencies, then cache, then unverified fallback.
 */
export function tierDomain(domain: string): TierDecision {
  const normalizedDomain = normalizeDomain(domain);
  const wireAgency = matchWireAgency(normalizedDomain);

  if (wireAgency) {
    return {
      tier: WIRE_SERVICE_TIER,
      reason: `Recognized wire/international broadcast agency: ${wireAgency}`,
    };
  }

  const cachedRating = RATINGS_CACHE[normalizedDomain];

  if (cachedRating) {
    return {
      tier: ESTABLISHED_TIER,
      reason: `Rated ${cachedRating.reliability} by published media bias dataset (${cachedRating.lean})`,
    };
  }

  return {
    tier: EMERGING_UNVERIFIED_TIER,
    reason:
      'Not found in reliability dataset; defaulting to unverified pending manual review',
  };
}

export const decideTier = tierDomain;
