import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import ratingsCache from '../tiering/ratings_cache.json';
import { DISCOVERY_TIER } from '../shared/constants.ts';
import { createGetSourcesHandler } from './sources.ts';

const [, WIRE_SERVICE_TIER, ESTABLISHED_TIER, EMERGING_UNVERIFIED_TIER] =
  DISCOVERY_TIER;

const SEEDED_SOURCES = [
  {
    domain: 'reuters.com',
    name: 'Reuters',
    discovery_tier: WIRE_SERVICE_TIER,
    tier_reason: 'Known international wire agency (category fact).',
  },
  {
    domain: 'aljazeera.com',
    name: 'Al Jazeera',
    discovery_tier: ESTABLISHED_TIER,
    tier_reason: 'Present in reliability dataset (established outlet).',
  },
  {
    domain: 'randomblog-example.net',
    name: 'Random Blog Example',
    discovery_tier: EMERGING_UNVERIFIED_TIER,
    tier_reason: 'Not found in reliability dataset.',
  },
];

describe('GET /sources', () => {
  it('T1: returns seeded sources with correct tiers and tier reasons', async () => {
    const { json } = await callGetSources(SEEDED_SOURCES);

    expect(json).toHaveLength(3);
    expect(json).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          domain: 'reuters.com',
          tier: WIRE_SERVICE_TIER,
          tier_reason: 'Known international wire agency (category fact).',
        }),
        expect.objectContaining({
          domain: 'aljazeera.com',
          tier: ESTABLISHED_TIER,
          tier_reason: 'Present in reliability dataset (established outlet).',
        }),
        expect.objectContaining({
          domain: 'randomblog-example.net',
          tier: EMERGING_UNVERIFIED_TIER,
          tier_reason: 'Not found in reliability dataset.',
        }),
      ]),
    );
    expect(json.every((source) => source.tier_reason)).toBe(true);
  });

  it('T2: emerging unverified seeded source returns null rating', async () => {
    const { json } = await callGetSources(SEEDED_SOURCES);
    const randomBlog = json.find(
      (source) => source.domain === 'randomblog-example.net',
    );

    expect(randomBlog).toEqual(
      expect.objectContaining({
        domain: 'randomblog-example.net',
        tier: EMERGING_UNVERIFIED_TIER,
        rating: null,
      }),
    );
  });

  it('T3: cached seeded source returns exact rating cache values', async () => {
    const { json } = await callGetSources(SEEDED_SOURCES);
    const alJazeera = json.find((source) => source.domain === 'aljazeera.com');

    expect(alJazeera).toEqual(
      expect.objectContaining({
        domain: 'aljazeera.com',
        rating: ratingsCache['aljazeera.com'],
      }),
    );
  });
});

type SeededSource = (typeof SEEDED_SOURCES)[number];
type SourceJson = {
  domain: string;
  name: string | null;
  rating: unknown;
  tier: string | null;
  tier_reason: string | null;
};

async function callGetSources(rows: SeededSource[]): Promise<{ json: SourceJson[] }> {
  const client = {
    from(table: string) {
      expect(table).toBe('sources');

      return {
        select(columns: string) {
          expect(columns).toBe('domain, name, discovery_tier, tier_reason');

          return {
            order(column: string, options: { ascending: boolean }) {
              expect(column).toBe('domain');
              expect(options).toEqual({ ascending: true });

              return Promise.resolve({
                data: [...rows].sort((a, b) => a.domain.localeCompare(b.domain)),
                error: null,
              });
            },
          };
        },
      };
    },
  };
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const handler = createGetSourcesHandler(
    () =>
      client as unknown as Parameters<
        typeof createGetSourcesHandler
      >[0] extends () => infer T
        ? T
        : never,
  );

  await handler({} as Request, { json, status } as unknown as Response);

  expect(status).not.toHaveBeenCalled();
  expect(json).toHaveBeenCalledTimes(1);
  return { json: json.mock.calls[0]?.[0] as SourceJson[] };
}
