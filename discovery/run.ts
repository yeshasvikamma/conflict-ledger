// =============================================================================
// discovery/run.ts - entrypoint, one full discovery cycle  [Person A]
// =============================================================================
// Orchestrates: for each query -> serp -> for each new URL -> insert source if
// new -> scrape -> upsert raw_items (on conflict do nothing on url).
//
// Owns writes to: sources (insert), raw_items (insert).
// Does NOT touch: discovery_tier, tier_reason (Person B), anything in /pipeline.
//
// Run:  pnpm run discovery
// =============================================================================

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORIGIN_TYPE } from '../shared/constants.ts';
import { serviceClient } from '../shared/supabaseClient.ts';
import { fetchCpj } from './cpj.ts';
import queries from './queries.json' with { type: 'json' };
import { scrapeUrl } from './scrape.ts';
import { serpSearch } from './serp.ts';

export type DiscoveryQueries = {
  narrative: string[];
  institutional: string[];
};

export type DiscoveryDependencies = {
  db: ReturnType<typeof serviceClient>;
  serpSearch: typeof serpSearch;
  scrapeUrl: typeof scrapeUrl;
  fetchCpj: typeof fetchCpj;
  queries: DiscoveryQueries;
};

const SEARCH_DISCOVERED_ORIGIN = ORIGIN_TYPE[0];
const productionQueries: DiscoveryQueries = queries;

export function createProductionDependencies(): DiscoveryDependencies {
  return {
    db: serviceClient(),
    serpSearch,
    scrapeUrl,
    fetchCpj,
    queries: productionQueries,
  };
}

type SourceIdRow = { id: string };

async function findSourceIdByDomain(
  db: DiscoveryDependencies['db'],
  domain: string,
): Promise<SourceIdRow | null> {
  const { data, error } = await db.from('sources').select('id').eq('domain', domain).maybeSingle();
  if (error) {
    throw error;
  }
  return data;
}

async function resolveSourceId(
  db: DiscoveryDependencies['db'],
  domain: string,
  discoveredVia: string,
): Promise<string> {
  const existing = await findSourceIdByDomain(db, domain);
  if (existing?.id) {
    return existing.id;
  }

  const { data: inserted, error: insertError } = await db
    .from('sources')
    .insert({
      domain,
      name: null,
      discovered_via: discoveredVia,
    })
    .select('id')
    .maybeSingle();

  if (inserted?.id) {
    return inserted.id;
  }

  const retry = await findSourceIdByDomain(db, domain);
  if (retry?.id) {
    return retry.id;
  }

  if (insertError) {
    throw insertError;
  }
  throw new Error(`Failed to resolve source for domain "${domain}"`);
}

export async function runCycle(deps: DiscoveryDependencies): Promise<void> {
  const allQueries = [...deps.queries.narrative, ...deps.queries.institutional];
  console.log(`[discovery] starting cycle over ${allQueries.length} queries`);

  for (const query of allQueries) {
    let results: Awaited<ReturnType<typeof deps.serpSearch>>;
    try {
      results = await deps.serpSearch(query);
    } catch (err) {
      console.error('[discovery] serpSearch failed for query:', query, err);
      continue;
    }

    for (const result of results) {
      try {
        const sourceId = await resolveSourceId(deps.db, result.domain, query);
        const scraped = await deps.scrapeUrl(result.url);

        if (!scraped.raw_text.trim()) {
          console.warn('[discovery] skipping blank raw_text for URL:', result.url);
          continue;
        }

        const { error: upsertError } = await deps.db.from('raw_items').upsert(
          {
            source_id: sourceId,
            headline: scraped.headline,
            raw_text: scraped.raw_text,
            url: result.url,
            origin_type: SEARCH_DISCOVERED_ORIGIN,
          },
          { onConflict: 'url', ignoreDuplicates: true },
        );

        if (upsertError) {
          throw upsertError;
        }
      } catch (err) {
        console.error(
          '[discovery] failed processing result:',
          { query, domain: result.domain, url: result.url },
          err,
        );
      }
    }
  }

  void deps.fetchCpj;
}

function isDirectExecution(): boolean {
  const entryFile = process.argv[1];
  if (!entryFile) return false;
  return path.resolve(entryFile) === fileURLToPath(import.meta.url);
}

async function main(): Promise<void> {
  await import('dotenv/config');
  await runCycle(createProductionDependencies());
}

if (isDirectExecution()) {
  void main().catch((err) => {
    console.error('[discovery] FAILED:', err);
    process.exitCode = 1;
  });
}
