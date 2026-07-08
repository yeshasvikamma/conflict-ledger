// =============================================================================
// scripts/seed.ts — FULL VERTICAL SLICE mock data
// =============================================================================
// This is the most important unblocker in the repo. It inserts a COMPLETE
// vertical slice — sources WITH tiers already set, raw_items with real-looking
// quotable text, and a deliberately-conflicting pair — so that:
//
//   • Person C can build+test the ENTIRE extraction→disagreement→counter path
//     before Person A or B have written a line of real ingestion.
//   • Person B's tier-gate has real tiered rows to filter from day one.
//   • Person A can compare their real inserts against this known-good shape.
//
// Run:  pnpm run seed        (insert)
//       pnpm run reset_db    (wipe first, then re-seed)
//
// It is idempotent on re-run (upserts on natural keys), so running it twice is safe.
// =============================================================================

import 'dotenv/config';
import { serviceClient } from '../shared/supabaseClient.ts';
import type { Database } from '../shared/types.ts';

const db = serviceClient();

type SourceInsert = Database['public']['Tables']['sources']['Insert'];
type RawItemInsert = Database['public']['Tables']['raw_items']['Insert'];

// ── Sources (tiers pre-set: one established, one wire_service, one unverified) ──
const SOURCES: SourceInsert[] = [
  {
    domain: 'reuters.com',
    name: 'Reuters',
    source_type: 'news',
    discovered_via: 'journalist killed Gaza',
    discovery_tier: 'wire_service',
    tier_reason: 'Known international wire agency (category fact).',
  },
  {
    domain: 'aljazeera.com',
    name: 'Al Jazeera',
    source_type: 'news',
    discovered_via: 'Gaza casualties today',
    discovery_tier: 'established',
    tier_reason: 'Present in reliability dataset (established outlet).',
  },
  {
    domain: 'randomblog-example.net',
    name: 'Random Blog Example',
    source_type: 'news',
    discovered_via: 'Gaza casualties today',
    discovery_tier: 'emerging_unverified',
    tier_reason: 'Not found in reliability dataset.',
  },
];

// ── raw_items: real-looking prose with an EXACT quotable sentence each. ─────────
// The conflicting pair (indices 2 & 3) reports different casualty counts for the
// SAME date + location — this is what lets Person C test disagreement.ts.
type SeedItem = {
  domain: string;
  headline: string;
  url: string;
  origin_type: string;
  content_shape: string;
  published_at: string;
  raw_text: string;
};

const RAW_ITEMS: SeedItem[] = [
  {
    domain: 'reuters.com',
    headline: 'Journalist killed in southern Gaza strike, press group says',
    url: 'https://reuters.com/world/seed-journalist-1',
    origin_type: 'search_discovered',
    content_shape: 'prose',
    published_at: '2024-05-01T10:00:00Z',
    raw_text:
      'A Palestinian journalist was killed on Wednesday while reporting near ' +
      'Rafah, a press freedom organization said. The organization said at least ' +
      '3 journalists have been killed in the enclave over the past week, ' +
      'bringing renewed attention to the dangers facing reporters. Local ' +
      'authorities did not immediately comment on the incident.',
  },
  {
    domain: 'aljazeera.com',
    headline: 'Rafah strikes: reporters among those killed, officials say',
    url: 'https://aljazeera.com/news/seed-journalist-2',
    origin_type: 'search_discovered',
    content_shape: 'prose',
    published_at: '2024-05-01T12:30:00Z',
    raw_text:
      'Strikes on Rafah killed several people on Wednesday, according to ' +
      'officials. Among the dead was a journalist, media offices reported. ' +
      'Rights groups say 3 journalists have been killed in recent days across ' +
      'the territory. Rescue teams continued searching the rubble into the evening.',
  },
  // ── CONFLICTING PAIR — same date, same location, different count ──────────────
  {
    domain: 'reuters.com',
    headline: 'Officials report casualties after Rafah strikes',
    url: 'https://reuters.com/world/seed-casualty-a',
    origin_type: 'search_discovered',
    content_shape: 'prose',
    published_at: '2024-05-01T18:00:00Z',
    raw_text:
      'Palestinian civil defense teams said the victims were local residents ' +
      'of Rafah. ' +
      'Medical officials in Rafah said on Wednesday that 15 people were killed ' +
      'in a series of strikes on the southern city. The figure could not be ' +
      'independently verified. Palestinian hospitals reported dozens more ' +
      'wounded arriving through the day.',
  },
  {
    domain: 'aljazeera.com',
    headline: 'Rafah death toll rises, health ministry says',
    url: 'https://aljazeera.com/news/seed-casualty-b',
    origin_type: 'search_discovered',
    content_shape: 'prose',
    published_at: '2024-05-01T20:15:00Z',
    raw_text:
      'Gaza health officials described the dead as Palestinians from Rafah. ' +
      'In its update, the health ministry said 20 people were killed in Rafah ' +
      'on Wednesday. ' +
      'The health ministry said 20 people were killed in Rafah on Wednesday, ' +
      'a higher toll than earlier estimates. Officials warned the number could ' +
      'rise further as rescue operations continued overnight.',
  },
  // ── An emerging_unverified item — must NEVER reach a counter. ─────────────────
  {
    domain: 'randomblog-example.net',
    headline: 'BREAKING: huge numbers reported in Gaza (unconfirmed)',
    url: 'https://randomblog-example.net/seed-unverified-1',
    origin_type: 'search_discovered',
    content_shape: 'prose',
    published_at: '2024-05-01T21:00:00Z',
    raw_text:
      'Unconfirmed reports circulating online claim 500 people were killed in ' +
      'a single strike. The claim has not been verified by any official source ' +
      'and is presented here as it appeared. No agency has corroborated it.',
  },
];

async function seed(): Promise<void> {
  console.log('[seed] upserting sources...');
  const { data: sourceRows, error: srcErr } = await db
    .from('sources')
    .upsert(SOURCES, { onConflict: 'domain' })
    .select('id, domain');
  if (srcErr) throw srcErr;

  const idByDomain = new Map<string, string>();
  for (const row of sourceRows ?? []) idByDomain.set(row.domain, row.id);
  console.log(`[seed] ${idByDomain.size} sources ready.`);

  console.log('[seed] upserting raw_items...');
  const rows: RawItemInsert[] = RAW_ITEMS.map((it) => {
    const source_id = idByDomain.get(it.domain);
    if (!source_id) throw new Error(`No source id for domain ${it.domain}`);
    return {
      source_id,
      headline: it.headline,
      raw_text: it.raw_text,
      url: it.url,
      published_at: it.published_at,
      origin_type: it.origin_type,
      content_shape: it.content_shape,
      processed: false,
    };
  });
  const { error: riErr, count } = await db
    .from('raw_items')
    .upsert(rows, { onConflict: 'url', count: 'exact' });
  if (riErr) throw riErr;

  console.log(`[seed] ${count ?? rows.length} raw_items ready.`);
  console.log('[seed] done. Vertical slice inserted:');
  console.log('  • 3 sources (1 wire_service, 1 established, 1 emerging_unverified)');
  console.log('  • 5 raw_items, including a conflicting 15-vs-20 casualty pair');
  console.log('  • 1 emerging_unverified item that must never reach a counter');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed] FAILED:', err);
    process.exit(1);
  });
