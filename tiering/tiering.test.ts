// =============================================================================
// tiering/tiering.test.ts  [Person B]
// =============================================================================
// The three tiering tests that define "done" (PRD §10). Start as .todo; convert
// to real tests as you implement.
// =============================================================================

import { describe, expect, it, vi } from 'vitest';
import { DISCOVERY_TIER } from '../shared/constants.ts';
import { tierDomain } from './tier.ts';
import { runTieringOnce } from './run.ts';

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

  it('T4: already-tiered source rows are not re-processed or modified', async () => {
    const alreadyTieredSource = {
      id: 'source-already-tiered',
      domain: 'nytimes.com',
      discovery_tier: ESTABLISHED_TIER,
      tier_reason: 'Already tiered before this poll',
    };
    const untieredSource = {
      id: 'source-untiered',
      domain: 'local-new-blog.example',
      discovery_tier: null,
      tier_reason: null,
    };
    const fakeSources = [alreadyTieredSource, untieredSource];
    const updates: Array<{ id: string; payload: unknown }> = [];
    const tierDomainMock = vi.fn(() => ({
      tier: WIRE_SERVICE_TIER,
      reason: 'Tiered during this poll',
    }));
    const db = {
      from(table: string) {
        expect(table).toBe('sources');

        return {
          select(columns: string) {
            expect(columns).toBe('id, domain');

            return {
              is(column: string, value: null) {
                expect(column).toBe('discovery_tier');
                expect(value).toBeNull();

                return Promise.resolve({
                  data: fakeSources
                    .filter((source) => source.discovery_tier === value)
                    .map((source) => ({
                      id: source.id,
                      domain: source.domain,
                    })),
                  error: null,
                });
              },
            };
          },
          update(payload: unknown) {
            return {
              eq(column: string, value: string) {
                expect(column).toBe('id');
                updates.push({ id: value, payload });

                return Promise.resolve({ data: null, error: null });
              },
            };
          },
        };
      },
    } as unknown as Parameters<typeof runTieringOnce>[0];

    await runTieringOnce(db, tierDomainMock);

    expect(tierDomainMock).toHaveBeenCalledTimes(1);
    expect(tierDomainMock).toHaveBeenCalledWith(untieredSource.domain);
    expect(updates).toEqual([
      {
        id: untieredSource.id,
        payload: {
          discovery_tier: WIRE_SERVICE_TIER,
          tier_reason: 'Tiered during this poll',
        },
      },
    ]);
    expect(updates.some((update) => update.id === alreadyTieredSource.id)).toBe(false);
    expect(alreadyTieredSource.discovery_tier).toBe(ESTABLISHED_TIER);
    expect(alreadyTieredSource.tier_reason).toBe('Already tiered before this poll');
  });
});
