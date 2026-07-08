// =============================================================================
// tiering/tiering.test.ts  [Person B]
// =============================================================================
// The three tiering tests that define "done" (PRD §10). Start as .todo; convert
// to real tests as you implement.
// =============================================================================

import { describe, expect, it } from 'vitest';
import { DISCOVERY_TIER } from '../shared/constants.ts';
import { tierDomain } from './tier.ts';

const [, WIRE_SERVICE_TIER, ESTABLISHED_TIER, EMERGING_UNVERIFIED_TIER] =
  DISCOVERY_TIER;

describe('tiering', () => {
  it('T1: cached non-wire domain -> established + human-readable reason', () => {
    const result = tierDomain('nytimes.com');

    expect(result.tier).toBe(ESTABLISHED_TIER);
    expect(result.reason).toEqual(expect.any(String));
    expect(result.reason.length).toBeGreaterThan(20);
  });

  it('T2: uncached non-wire domain -> emerging unverified + reason', () => {
    const result = tierDomain('local-new-blog.example');

    expect(result.tier).toBe(EMERGING_UNVERIFIED_TIER);
    expect(result.reason.toLowerCase()).toContain('not found in reliability dataset');
  });

  it('T3: wire agency rule wins even when the domain is cached', () => {
    const result = tierDomain('news.bbc.com');

    expect(result.tier).toBe(WIRE_SERVICE_TIER);
    expect(result.reason).toContain('bbc.com');
  });
});
