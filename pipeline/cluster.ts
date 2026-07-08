// =============================================================================
// pipeline/cluster.ts — embedding-based event clustering  [Person C]
// =============================================================================
// Groups loosely-related claims into the same event via embedding cosine
// similarity. APPROXIMATE by design — it does not carry the correctness weight
// of disagreement.ts. It only assigns event membership for claims not already
// grouped by a disagreement pair. (pipeline.test.ts T5.)
//
// Tier A: keep this minimal. A crude grouping is fine; the counter and the
// disagreement demo do not depend on clustering being clever.
// =============================================================================

import { randomUUID } from 'node:crypto';
import OpenAI from 'openai';
import { CLAIM_TYPES, EVENT_CATEGORY } from '../shared/constants.ts';
import { serviceClient } from '../shared/supabaseClient.ts';
import type { Database } from '../shared/types.ts';

const DEFAULT_CLUSTER_PER_RUN = 20;
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
const DEFAULT_SIMILARITY_THRESHOLD = 0.93;
const [JOURNALIST_KILLED_CLAIM_TYPE, CASUALTY_COUNT_CLAIM_TYPE] = CLAIM_TYPES;
const [, CASUALTY_EVENT_CATEGORY, JOURNALIST_EVENT_CATEGORY] = EVENT_CATEGORY;

type ClusterDb = Pick<ReturnType<typeof serviceClient>, 'from'>;
type ClaimRow = Pick<
  Database['public']['Tables']['claims']['Row'],
  'id' | 'claim_type' | 'raw_item_id' | 'raw_quote' | 'date_occurred' | 'location'
>;
type RawItemRow = Pick<
  Database['public']['Tables']['raw_items']['Row'],
  'id' | 'headline'
>;
type EventInsert = Database['public']['Tables']['events']['Insert'];
type EventClaimInsert = Database['public']['Tables']['event_claims']['Insert'];

type CandidateClaim = {
  id: string;
  claim_type: string;
  date_occurred: string | null;
  location: string | null;
  text: string;
  embedding: number[];
};

type ClusterGroup = {
  claimIds: string[];
  centroid: number[];
};

export type ClusterEmbedder = (inputs: string[]) => Promise<number[][]>;

export interface RunClusteringOptions {
  db?: ClusterDb;
  embedder?: ClusterEmbedder;
  similarityThreshold?: number;
}

/** Cosine similarity between two equal-length vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function clusteringCap(): number {
  const raw = process.env.MAX_EXTRACT_PER_RUN;
  if (!raw) return DEFAULT_CLUSTER_PER_RUN;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_CLUSTER_PER_RUN;
  return parsed;
}

function embeddingModel(): string {
  return process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
}

export async function defaultEmbedder(inputs: string[]): Promise<number[][]> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.embeddings.create({
    model: embeddingModel(),
    input: inputs,
  });
  return response.data.map((row) => row.embedding);
}

function categoryForClaimType(claimType: string): string {
  return claimType === JOURNALIST_KILLED_CLAIM_TYPE
    ? JOURNALIST_EVENT_CATEGORY
    : CASUALTY_EVENT_CATEGORY;
}

function eventDateForCluster(claims: CandidateClaim[]): string | null {
  const dates = claims
    .map((claim) => claim.date_occurred)
    .filter((date): date is string => !!date)
    .sort();
  return dates[0] ?? null;
}

function locationForCluster(claims: CandidateClaim[]): string | null {
  return claims.find((claim) => claim.location)?.location ?? null;
}

function updateCentroid(centroid: number[], next: number[], size: number): number[] {
  const updated = [...centroid];
  for (let i = 0; i < updated.length; i += 1) {
    updated[i] = (updated[i] * size + next[i]) / (size + 1);
  }
  return updated;
}

async function insertClusterEvent(
  db: ClusterDb,
  claims: CandidateClaim[],
): Promise<string> {
  const anchor = claims[0];
  if (!anchor) {
    throw new Error('Attempted to create a cluster event with no claims');
  }
  const row: EventInsert = {
    id: randomUUID(),
    category: categoryForClaimType(anchor.claim_type),
    event_date: eventDateForCluster(claims),
    location: locationForCluster(claims),
  };
  const { error } = await db.from('events').insert(row);
  if (error) throw error;
  if (!row.id) throw new Error('Cluster event insert produced no event id');
  return row.id;
}

async function linkClusterClaims(
  db: ClusterDb,
  eventId: string,
  claimIds: string[],
): Promise<void> {
  const rows: EventClaimInsert[] = claimIds.map((claimId) => ({
    event_id: eventId,
    claim_id: claimId,
  }));
  const { error } = await db
    .from('event_claims')
    .upsert(rows, { onConflict: 'event_id,claim_id' });
  if (error) throw error;
}

/**
 * Cluster recent claims into events by similarity of (headline + raw_quote).
 *
 * TODO(Person C):
 *   - embed headline + raw_quote via OpenAI text-embedding-3-small
 *   - compare against recently-open events (last ~72h)
 *   - above a threshold -> attach to that event; else -> new event
 *   - skip claims already grouped by disagreement detection
 */
export async function runClustering(options: RunClusteringOptions = {}): Promise<void> {
  const db = options.db ?? serviceClient();
  const embedder = options.embedder ?? defaultEmbedder;
  const similarityThreshold =
    options.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  const cap = clusteringCap();
  if (cap <= 1) return;

  const { data: claimData, error: claimError } = await db
    .from('claims')
    .select('id, claim_type, raw_item_id, raw_quote, date_occurred, location')
    .in('claim_type', [JOURNALIST_KILLED_CLAIM_TYPE, CASUALTY_COUNT_CLAIM_TYPE])
    .limit(cap);
  if (claimError) throw claimError;

  const claims = (claimData ?? []) as ClaimRow[];
  if (claims.length < 2) return;

  const claimIds = claims.map((claim) => claim.id);
  const { data: existingLinks, error: linkError } = await db
    .from('event_claims')
    .select('claim_id')
    .in('claim_id', claimIds);
  if (linkError) throw linkError;

  const linkedClaimIds = new Set((existingLinks ?? []).map((link) => link.claim_id));
  const unlinkedClaims = claims.filter((claim) => !linkedClaimIds.has(claim.id));
  if (unlinkedClaims.length < 2) return;

  const rawItemIds = [...new Set(unlinkedClaims.map((claim) => claim.raw_item_id))];
  const { data: rawItemData, error: rawItemError } = await db
    .from('raw_items')
    .select('id, headline')
    .in('id', rawItemIds);
  if (rawItemError) throw rawItemError;

  const rawItemsById = new Map<string, RawItemRow>();
  for (const rawItem of (rawItemData ?? []) as RawItemRow[]) {
    rawItemsById.set(rawItem.id, rawItem);
  }

  const clusterCandidates: CandidateClaim[] = unlinkedClaims.map((claim) => {
    const rawItem = rawItemsById.get(claim.raw_item_id);
    const headline = rawItem?.headline ?? '';
    return {
      id: claim.id,
      claim_type: claim.claim_type,
      date_occurred: claim.date_occurred,
      location: claim.location,
      text: `${headline}\n${claim.raw_quote}`.trim(),
      embedding: [] as number[],
    };
  });

  let embeddings: number[][];
  try {
    embeddings = await embedder(clusterCandidates.map((candidate) => candidate.text));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(
      JSON.stringify({
        event: 'clustering.embedder_failed',
        candidate_count: clusterCandidates.length,
        error: message,
      }),
    );
    return;
  }
  if (embeddings.length !== clusterCandidates.length) {
    throw new Error(
      `Embedder returned ${embeddings.length} vectors for ${clusterCandidates.length} claims`,
    );
  }
  for (let i = 0; i < clusterCandidates.length; i += 1) {
    const embedding = embeddings[i];
    if (!embedding) {
      throw new Error(`Missing embedding vector for claim index ${i}`);
    }
    clusterCandidates[i] = { ...clusterCandidates[i], embedding };
  }

  const groups: ClusterGroup[] = [];
  for (const candidate of clusterCandidates) {
    let bestIndex = -1;
    let bestSimilarity = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < groups.length; index += 1) {
      const group = groups[index];
      if (!group) continue;
      const similarity = cosineSimilarity(candidate.embedding, group.centroid);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestIndex = index;
      }
    }

    if (bestIndex >= 0 && bestSimilarity >= similarityThreshold) {
      const group = groups[bestIndex];
      if (!group) continue;
      group.centroid = updateCentroid(
        group.centroid,
        candidate.embedding,
        group.claimIds.length,
      );
      group.claimIds.push(candidate.id);
      continue;
    }

    groups.push({
      claimIds: [candidate.id],
      centroid: candidate.embedding,
    });
  }

  const candidatesById = new Map(
    clusterCandidates.map((candidate) => [candidate.id, candidate]),
  );

  for (const group of groups) {
    if (group.claimIds.length < 2) continue;
    const groupedClaims: CandidateClaim[] = [];
    for (const claimId of group.claimIds) {
      const claim = candidatesById.get(claimId);
      if (claim) groupedClaims.push(claim);
    }
    if (groupedClaims.length < 2) continue;

    const eventId = await insertClusterEvent(db, groupedClaims);
    await linkClusterClaims(
      db,
      eventId,
      groupedClaims.map((claim) => claim.id),
    );
  }
}
