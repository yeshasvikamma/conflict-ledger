# Codex prompt — Live Conflict Ledger scaffold

You have two ways to use this. **Read both, pick one.**

---

## Option 1 (recommended): skip Codex for the scaffold, use the zip

The scaffold is already built, type-checks clean, and `pnpm test` is green. The
fastest, lowest-risk path is:

1. Unzip `conflict-ledger.zip`, rename the folder to `conflict-ledger`.
2. `cd conflict-ledger && pnpm install`
3. Create a Supabase project, run `shared/schema.sql` in its SQL editor.
4. `supabase gen types typescript --project-id <id> > shared/types.ts` (replaces
   the placeholder), commit it.
5. `cp .env.example .env` and fill it in.
6. `pnpm run seed`, then `pnpm test && pnpm run typecheck` to confirm green.
7. `git init`, push to GitHub, invite your two teammates.

Then each person opens their own terminal + agent, points it at the repo, and
tells the agent: **"Read AGENT.md (root) and the AGENT.md in `<their folder>`,
then implement that track."** That's it — the AGENT.md files carry all the
per-track instructions.

Use Option 2 only if you'd rather have Codex regenerate everything from scratch
(e.g. you don't want to trust the zip, or you want Codex to own the scaffold
commit).

---

## Option 2: have Codex build the scaffold from scratch

Paste everything below the line into Codex as a single task. It reproduces the
same scaffold. Review its output against the zip if you want a diff.

------------------------------------------------------------------------------

You are scaffolding a 2-day, 3-person hackathon monorepo called **Live Conflict
Ledger**. Build ONLY the skeleton — frozen shared contract, per-track stub files
with typed signatures, tests as `.todo` placeholders (plus a few real ones for
pure functions), a working seed script, an ugly floor page, and all the docs.
**Do not implement any track's real logic** (no live Bright Data / OpenAI / Grok
calls) — that's for the three track owners afterward. The whole point is a
skeleton that type-checks and whose `pnpm test` is green on a fresh clone, so
three people can then build in parallel against a frozen contract.

### Hard requirements

- **All TypeScript, ESM, Node 20+, pnpm**, single lockfile at root, `"type":
  "module"`. Run scripts via `tsx`. Tests via `vitest`. Formatting `prettier`
  only (no ESLint). Deps: `@supabase/supabase-js@2.45.4` (pin this exact version
  — newer majors break the `Database` generic against a hand-written types file),
  `openai`, `zod`, `dotenv`, `express`; dev: `tsx`, `typescript`, `vitest`,
  `prettier`, `@types/node`, `@types/express`.
- `tsconfig.json`: strict, `moduleResolution: "Bundler"`,
  `allowImportingTsExtensions: true`, `noEmit: true`, `noUnusedLocals/Parameters`,
  `lib: ["ES2022","DOM"]`, exclude `web`. Imports use explicit `.ts` extensions.
- **Everything must type-check (`tsc --noEmit`) and `pnpm test` must pass** on a
  fresh clone with no `.env` and no real Supabase project. Achieve this by: (a)
  making the seed/reset scripts import types but not run at test time, (b) making
  all stub functions `throw new Error('... not implemented ...')`, (c) writing the
  pure helpers for real (see below) and testing only those.

### Directory layout

```
/repo-root
  .env.example .gitignore .prettierrc .prettierignore package.json tsconfig.json
  README.md AGENT.md CONTEXT.md
  shared/    schema.sql constants.ts claim_types.md types.ts supabaseClient.ts
  discovery/ serp.ts scrape.ts cpj.ts queries.json run.ts discovery.test.ts AGENT.md
  tiering/   ratings_cache.json tier.ts run.ts tiering.test.ts AGENT.md
  signal/    grok.ts run.ts signal.test.ts AGENT.md
  pipeline/  extract.ts disagreement.ts cluster.ts snapshots.ts geocode.ts zones.ts
             valueSchemas.ts run.ts pipeline.test.ts prompts/extract_claim.md AGENT.md
  api/       counters.ts sources.ts timeline.ts map.ts event.ts entity.ts server.ts
  web/       floor.html
  scripts/   seed.ts reset_db.ts
  tests/     integration.test.ts
```

### The frozen shared contract (write these fully, they are the source of truth)

- `shared/schema.sql` — Postgres schema. Tables: `sources` (id uuid pk,
  domain text unique not null, name, source_type default 'news', discovered_via
  text not null, discovery_tier, tier_reason, created_at); `raw_items` (id, source_id
  fk, headline, raw_text not null, url text unique not null, published_at,
  origin_type not null, content_shape default 'unknown', processed bool default
  false, created_at); `claims` (id, raw_item_id fk, claim_type not null, value
  jsonb not null, raw_quote text not null, date_occurred date, location, lat, lng,
  geo_confidence, is_unverified_signal bool default false, created_at); `entities`
  (id, entity_type not null, name not null, subtype, metadata jsonb, lat, lng,
  created_at); `claim_entities` (claim_id, entity_id, pk both); `events` (id, title,
  neutral_summary, location, lat, lng, category, event_date, framing_notes jsonb,
  has_disagreement bool default false, disagreement_note, first_seen_at,
  last_updated_at); `event_claims` (event_id, claim_id, pk both); `zones` (id,
  zone_type not null, region, geo_json jsonb, date_observed, source_id fk,
  raw_quote, created_at); `counter_snapshots` (id, counter_key not null, as_of_date
  date not null, low_value numeric, high_value numeric, primary_source_ids uuid[],
  claim_count int, computed_at). Enable `pgcrypto` and `vector` extensions. Add
  indexes on raw_items(processed), raw_items(origin_type), claims(claim_type,
  date_occurred), sources(discovery_tier), counter_snapshots(counter_key,
  as_of_date). Comment which columns are "Tier B". Add a big header comment: this
  file is FROZEN, changing it requires regenerating types.ts in the same commit.
- `shared/constants.ts` — export `as const` arrays + derived types:
  `DISCOVERY_TIER` = institutional|wire_service|established|emerging_unverified;
  `ORIGIN_TYPE` = search_discovered|institutional_direct|x; `CONTENT_SHAPE` =
  prose|structured|unknown; `CLAIM_TYPES` = journalist_killed, casualty_count,
  aid_worker_killed, hostage_status, wounded_count, displacement, strike;
  `COUNTABLE_TIERS` = institutional|wire_service|established; `ENTITY_TYPE`,
  `ZONE_TYPE`, `EVENT_CATEGORY`. Export an `isCountableTier(tier)` helper. Header
  comment: this is the one seam where a typo breaks everything; never hand-type
  these strings elsewhere.
- `shared/claim_types.md` — a table of value shapes per claim_type (journalist_killed
  = {count:number, names:string[]}; casualty_count = {count:number,
  group:"palestinian"|"israeli"|"unknown", subtype:"civilian"|"child"|"combatant"|
  "total"|null}; the rest per the full list, marked Tier A/B), the counter_key
  mapping for casualty_count (palestinian+total/null→palestinians_killed,
  israeli+total/null→israelis_killed, any+child→children_killed), and the
  DETERMINISTIC DISAGREEMENT PREDICATE: two claims disagree iff same claim_type AND
  date_occurred within ±1 day AND same location AND same discriminators (group+subtype
  for casualties; names overlap for journalists) AND different count. Include worked
  examples (15 vs 20 same day/location/discriminators → disagree; different subtype
  → not; agreeing counts → not; journalist names-overlap+different-count → disagree).
  State Tier A implements only journalist_killed + casualty_count.
- `shared/types.ts` — a hand-written placeholder `Database` interface mirroring the
  schema (Row/Insert/Update per table), with a header comment saying to REPLACE the
  whole file with `supabase gen types typescript` output at kickoff. Add
  `prettier-ignore` via `.prettierignore` (don't format this file).
- `shared/supabaseClient.ts` — `serviceClient()` (service-role key, backend) and
  `anonClient()` (anon key, read-only), each `createClient<Database>(...)`, with a
  `required(name)` env helper that throws a helpful error.

### Stubs (typed signatures + rich comments + `throw 'not implemented'`)

For each track, write the files with correct TypeScript signatures, doc comments
pulled from the per-track AGENT.md, and bodies that throw "not implemented — see
<folder>/AGENT.md". EXCEPT implement these pure functions for real (they're small,
pure, and heavily relied on) and unit-test them:

- `pipeline/extract.ts` → `isVerbatimSubstring(quote, rawText)` (whitespace-
  normalized substring check) and `validateClaimValue(claim)` (zod safeParse
  against `valueSchemas.ts`). Also declare `ExtractedClaim` interface and a
  `runExtraction()` stub with a detailed comment covering the cost cap
  (MAX_EXTRACT_PER_RUN) and the two failure modes (LLM call completed → processed=
  true; call failed/timeout/429 → processed=false + log).
- `pipeline/disagreement.ts` → `daysApart(a,b)`, `namesOverlap(a,b)`,
  `claimsDisagree(a,b)` implemented for casualty_count + journalist_killed per the
  predicate, plus a `ClaimForCompare` interface and a `runDisagreementDetection()`
  stub.
- `pipeline/cluster.ts` → `cosineSimilarity(a,b)` implemented; `runClustering()`
  stub.
- `pipeline/snapshots.ts` → `computeSnapshots()` stub whose comment stresses THE
  TIER GATE LIVES HERE ONLY (filter COUNTABLE_TIERS + origin_type).
- `pipeline/valueSchemas.ts` → zod schemas for all 7 claim types + a
  `VALUE_SCHEMA: Record<ClaimType, ZodTypeAny>` map.
- `discovery/scrape.ts` → implement a `withBackoff(fn, {maxRetries,baseMs})` helper
  (exponential backoff) for real; `serpSearch`/`scrapeUrl`/`fetchCpj` stubs. `cpj.ts`
  gets a prominent comment block explaining it's the ONE deliberate hardcoded
  exception and why.
- `tiering/tier.ts` → a `WIRE_AGENCIES` Set + `decideTier(domain)` stub +
  `TierDecision` interface.
- `signal/grok.ts` → `SignalPost` interface + `grokSearch(query)` stub.
- `api/*.ts` → each endpoint an async `(req,res)` returning `res.status(501).json`;
  `server.ts` wires them with express, permissive CORS, `/health`, Tier A routes
  (/counters, /counters/:key/breakdown, /sources) and Tier B routes mounted.

### Tests

- `pipeline/pipeline.test.ts` — 4 REAL passing tests for `isVerbatimSubstring`
  (accept verbatim, reject hallucinated) and `claimsDisagree` (15v20 disagree,
  different-subtype not, agreeing not), plus 6 `it.todo` for T1–T6 (DB-touching).
- `discovery/discovery.test.ts` (T1–T4), `tiering/tiering.test.ts` (T1–T3),
  `signal/signal.test.ts` (T1–T2), `tests/integration.test.ts` (5 invariants) — all
  as `it.todo` with descriptive names.

### Data + scripts + docs

- `scripts/seed.ts` — REAL, runnable. Insert a full vertical slice via
  `serviceClient()`: 3 sources with tiers preset (reuters.com→wire_service,
  aljazeera.com→established, randomblog-example.net→emerging_unverified); 5 raw_items
  with realistic prose containing an exact quotable sentence each, INCLUDING a
  conflicting pair (reuters "15 people were killed" vs aljazeera "20 people were
  killed", same date 2024-05-01, same location Rafah) and one emerging_unverified
  item that must never be counted. Idempotent (upsert on domain / url). Type the
  arrays explicitly as `Database[...]['Insert'][]`.
- `scripts/reset_db.ts` — delete all tables in FK-safe order.
- `discovery/queries.json` — narrative + institutional query arrays, no domains.
- `tiering/ratings_cache.json` — ~7 placeholder domain→{reliability,lean} entries
  with a comment to expand to ≥50.
- `pipeline/prompts/extract_claim.md` — the extraction prompt (forced JSON, the
  verbatim raw_quote rule, the two Tier A shapes, a structured-source variant, and
  {{headline}}/{{raw_text}} placeholders).
- `web/floor.html` — a single ugly HTML file (monospace, no framework) that fetches
  `/counters` and `/counters/:key/breakdown` from `http://localhost:8787` and renders
  the counter + click-through to sourced quotes. Comment says keep it ugly until
  Tier A is locked.
- `.env.example` — BRIGHTDATA_API_KEY, OPENAI_API_KEY, GROK_API_KEY, SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, DISCOVERY_INTERVAL_SECONDS=30,
  MAX_EXTRACT_PER_RUN=20, with comments. No Reddit keys.
- `.gitignore` — node_modules, .env*, dist, logs, OS/editor files.
- `AGENT.md` (root) — product summary, the two non-negotiables (claim_types.md
  first, seed is a vertical slice), the Tier A/B discipline + hard gate, the frozen
  contract list, the ownership table, golden LLM rules (forced JSON, zod, verbatim
  quote, append-only), cost discipline, tooling. Add: agents get instructions only
  from AGENT.md files; never edit shared/* without human sign-off (no one hears "I'm
  editing schema" across terminals).
- Per-track `AGENT.md` (discovery/tiering/signal/pipeline) — job in one line, what
  they own (folder + tables), files + what goes in them, required tests, definition
  of done, gotchas. Pipeline's is the most detailed (build order 1–5, the two
  failure modes, the tier gate).
- `CONTEXT.md` — architecture, data flow diagram, why the seams are where they are
  (DB-only comms, tier gate in one place, append-only claims, contract-first,
  vertical-slice seed), the disagreement predicate, honest scope notes (no
  territorial-control map; structured extraction is a bonus not the floor;
  unbiased-via-transparency), Tier A/B rationale.
- `README.md` — one-paragraph product, stack, first-time setup (install → apply
  schema → gen types → env → seed → verify green), run commands, the two tiers, repo
  map, ownership table, whole-project definition of done.

### Finish

Run `pnpm install`, `pnpm run typecheck`, `pnpm test`, `pnpm run format:check` and
make all of them pass. Then stop. Do not implement track logic.
