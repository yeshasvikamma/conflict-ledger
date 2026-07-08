// =============================================================================
// signal/run.ts — pull X signal, insert tagged rows  [Person B]
// =============================================================================
// Owns writes to: sources (insert, source_type='x'), raw_items (insert, origin_type='x').
//
// Run:  pnpm run signal
// =============================================================================

import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import queries from './queries.json';
import { ORIGIN_TYPE } from '../shared/constants.ts';
import { serviceClient } from '../shared/supabaseClient.ts';
import type { Database } from '../shared/types.ts';
import { grokSearch, type SignalPost } from './grok.ts';

const [, , X_ORIGIN_TYPE] = ORIGIN_TYPE;

type SignalClient = ReturnType<typeof serviceClient>;
type SourceRow = Pick<Database['public']['Tables']['sources']['Row'], 'id'>;
type Searcher = (query: string) => Promise<SignalPost[]>;

function intervalMs(): number {
  const seconds = Number.parseInt(process.env.DISCOVERY_INTERVAL_SECONDS ?? '30', 10);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error('DISCOVERY_INTERVAL_SECONDS must be a positive number of seconds');
  }

  return seconds * 1000;
}

export async function runSignalOnce(
  db: SignalClient = serviceClient(),
  searchQueries: readonly string[] = queries,
  searcher: Searcher = grokSearch,
): Promise<void> {
  for (const query of searchQueries) {
    let posts: SignalPost[];

    try {
      posts = await searcher(query);
    } catch (err) {
      console.warn(`[signal] query failed for "${query}":`, err);
      continue;
    }

    for (const post of posts) {
      const sourceId = await ensureSignalSource(db, post, query);
      await upsertSignalRawItem(db, sourceId, post);
    }
  }
}

export async function startSignalPolling(): Promise<NodeJS.Timeout> {
  await runSignalOnce();

  return setInterval(() => {
    runSignalOnce().catch((err: unknown) => {
      console.error('[signal] poll failed:', err);
    });
  }, intervalMs());
}

async function ensureSignalSource(
  db: SignalClient,
  post: SignalPost,
  query: string,
): Promise<string> {
  const domain = sourceDomain(post);
  const { data: existingSources, error: selectError } = await db
    .from('sources')
    .select('id')
    .eq('domain', domain)
    .limit(1);

  if (selectError) {
    throw new Error(
      `[signal] failed to look up source ${domain}: ${selectError.message}`,
    );
  }

  const existingSource = (existingSources ?? [])[0] as SourceRow | undefined;
  if (existingSource) {
    return existingSource.id;
  }

  const { data: insertedSource, error: insertError } = await db
    .from('sources')
    .insert({
      domain,
      name: post.author_handle,
      source_type: X_ORIGIN_TYPE,
      discovered_via: query,
    })
    .select('id')
    .single();

  if (insertError) {
    throw new Error(
      `[signal] failed to insert source ${domain}: ${insertError.message}`,
    );
  }

  console.log(`[signal] inserted source ${domain} -> ${X_ORIGIN_TYPE}`);
  return insertedSource.id;
}

async function upsertSignalRawItem(
  db: SignalClient,
  sourceId: string,
  post: SignalPost,
): Promise<void> {
  const { data: insertedRows, error } = await db
    .from('raw_items')
    .upsert(
      {
        source_id: sourceId,
        headline: `Signal post by ${post.author_handle}`,
        raw_text: post.text,
        url: post.url,
        published_at: post.posted_at,
        origin_type: X_ORIGIN_TYPE,
      },
      {
        onConflict: 'url',
        ignoreDuplicates: true,
      },
    )
    .select('id');

  if (error) {
    throw new Error(`[signal] failed to upsert raw item ${post.url}: ${error.message}`);
  }

  if ((insertedRows ?? []).length > 0) {
    console.log(`[signal] inserted raw_item ${post.url} -> ${X_ORIGIN_TYPE}`);
  }
}

function sourceDomain(post: SignalPost): string {
  const handle = post.author_handle.replace(/^@/, '').toLowerCase() || 'unknown';
  return `x.com/${handle}`;
}

function isDirectRun(): boolean {
  return process.argv[1]
    ? import.meta.url === pathToFileURL(process.argv[1]).href
    : false;
}

if (isDirectRun()) {
  startSignalPolling().catch((err: unknown) => {
    console.error('[signal] FAILED:', err);
    process.exit(1);
  });
}
