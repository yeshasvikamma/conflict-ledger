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
const INSTITUTIONAL_DIRECT_ORIGIN = ORIGIN_TYPE[1];
const CPJ_DOMAIN = 'cpj.org';
const CPJ_NAME = 'Committee to Protect Journalists';
const CPJ_DISCOVERED_VIA = 'direct:cpj';
const productionQueries: DiscoveryQueries = queries;

function intervalMs(): number {
  const seconds = Number.parseInt(process.env.DISCOVERY_INTERVAL_SECONDS ?? '30', 10);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error('DISCOVERY_INTERVAL_SECONDS must be a positive number of seconds');
  }

  return seconds * 1000;
}

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
type SourceInsertPayload = {
  domain: string;
  name: string | null;
  discovered_via: string;
  source_type?: string;
};

async function findSourceIdByDomain(
  db: DiscoveryDependencies['db'],
  domain: string,
): Promise<SourceIdRow | null> {
  const { data, error } = await db
    .from('sources')
    .select('id')
    .eq('domain', domain)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data;
}

async function resolveSourceId(
  db: DiscoveryDependencies['db'],
  source: SourceInsertPayload,
): Promise<string> {
  const existing = await findSourceIdByDomain(db, source.domain);
  if (existing?.id) {
    return existing.id;
  }

  const { data: inserted, error: insertError } = await db
    .from('sources')
    .insert(source)
    .select('id')
    .maybeSingle();

  if (inserted?.id) {
    return inserted.id;
  }

  const retry = await findSourceIdByDomain(db, source.domain);
  if (retry?.id) {
    return retry.id;
  }

  if (insertError) {
    throw insertError;
  }
  throw new Error(`Failed to resolve source for domain "${source.domain}"`);
}

function isOfficialCpjUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      (url.hostname === CPJ_DOMAIN || url.hostname.endsWith(`.${CPJ_DOMAIN}`))
    );
  } catch {
    return false;
  }
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
        const sourceId = await resolveSourceId(deps.db, {
          domain: result.domain,
          name: null,
          discovered_via: query,
        });
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

  let cpjItems: Awaited<ReturnType<typeof deps.fetchCpj>>;
  try {
    cpjItems = await deps.fetchCpj();
  } catch (err) {
    console.error('[discovery] CPJ fetch failed:', err);
    return;
  }

  for (const item of cpjItems) {
    try {
      if (!isOfficialCpjUrl(item.url)) {
        throw new Error(`Rejected non-CPJ URL: ${item.url}`);
      }
      if (!item.raw_text.trim()) {
        throw new Error(`Rejected blank CPJ raw_text for URL: ${item.url}`);
      }

      const sourceId = await resolveSourceId(deps.db, {
        domain: CPJ_DOMAIN,
        name: CPJ_NAME,
        // SOURCE_TYPE has no shared constant in the frozen contract.
        source_type: 'institutional_direct',
        discovered_via: CPJ_DISCOVERED_VIA,
      });

      const { error: upsertError } = await deps.db.from('raw_items').upsert(
        {
          source_id: sourceId,
          headline: item.headline,
          raw_text: item.raw_text,
          url: item.url,
          published_at: item.published_at ?? null,
          origin_type: INSTITUTIONAL_DIRECT_ORIGIN,
        },
        { onConflict: 'url', ignoreDuplicates: true },
      );

      if (upsertError) {
        throw upsertError;
      }
    } catch (err) {
      console.error('[discovery] failed processing CPJ item:', { url: item.url }, err);
    }
  }
}

export async function startDiscoveryPolling(
  deps: DiscoveryDependencies = createProductionDependencies(),
): Promise<NodeJS.Timeout> {
  await runCycle(deps);

  return setInterval(() => {
    runCycle(deps).catch((err: unknown) => {
      console.error('[discovery] poll failed:', err);
    });
  }, intervalMs());
}

function isDirectExecution(): boolean {
  const entryFile = process.argv[1];
  if (!entryFile) return false;
  return path.resolve(entryFile) === fileURLToPath(import.meta.url);
}

async function main(): Promise<void> {
  await import('dotenv/config');
  await startDiscoveryPolling();
}

if (isDirectExecution()) {
  void main().catch((err) => {
    console.error('[discovery] FAILED:', err);
    process.exitCode = 1;
  });
}
