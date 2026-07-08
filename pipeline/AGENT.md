# AGENT.md — Pipeline track (Person C, "The Reader") — the critical path

Read the root `AGENT.md` first. This file covers `pipeline/` and most of `api/`.

**This is the critical path.** The verbatim-quote enforcement, the disagreement
predicate, the counter snapshots, and most of the API all live here, and every
Tier B visual depends on this track producing clean data. Build it carefully and
in order.

## Your job in one line

Read articles, turn them into structured provable facts (each pinned to an exact
quoted sentence), detect when sources disagree (keep both, never average), and
serve the counter API.

## What you own

- Folders: `pipeline/`, and the Person C endpoints in `api/`.
- Tables you WRITE: `claims`, `events`, `event_claims`, `entities`,
  `claim_entities`, `zones`, `counter_snapshots`, and `raw_items.processed`
  (that column ONLY).
- Tables you READ: `raw_items`, `sources`.
- You do NOT: modify `raw_items`/`sources` beyond `processed`; collapse two
  disagreeing claims into one value under any circumstance (hard product rule).

## Build order (Tier A) — do these in sequence

### 1. `extract.ts` — LLM claim extraction

Process up to `MAX_EXTRACT_PER_RUN` (env, default 20) unprocessed `raw_items`.
For each: detect `content_shape` (prose vs structured) → pick the matching
prompt from `prompts/extract_claim.md` → call the LLM in **forced JSON mode** →
for each returned claim:

- `validateClaimValue(claim)` against `valueSchemas.ts`; null → log + skip.
- `isVerbatimSubstring(raw_quote, raw_text)`; false → log + skip.
- insert into `claims`, with `is_unverified_signal = (origin_type === 'x')`.

**Two failure modes — do NOT conflate them (tested T6):**

- LLM call **completed** (you got a response and evaluated it, even if every
  claim was rejected) → set `processed = true`. Retrying won't help.
- LLM call **failed to complete** (timeout / 429 / network) → leave
  `processed = false` and log. The row was never evaluated; marking it processed
  would silently drop that article forever.

`isVerbatimSubstring` and `validateClaimValue` are **already implemented** in the
stub — they're small, pure, and the most important checks in the project. Build
around them.

### 2. `disagreement.ts` — deterministic disagreement detection

Implements the EXACT predicate from `shared/claim_types.md` §2. The core
function `claimsDisagree(a, b)` is **already implemented** for the Tier A types
(casualty_count via group+subtype+count, journalist_killed via names-overlap+count).
Your job is `runDisagreementDetection`: pull candidate claims, run the predicate
on pairs, and when it fires, link both claims to ONE `events` row, set
`has_disagreement=true`, write a short human-readable `disagreement_note`. Never
mutate the claims. This is a plain field comparison — NOT embeddings.

### 3. `cluster.ts` — approximate event grouping

Embed `headline + raw_quote` (OpenAI `text-embedding-3-small`), cosine-similarity
(`cosineSimilarity` is already implemented) against recently-open events (~72h),
attach or create an event. Allowed to be approximate — keep it minimal for Tier A.
Skip claims already grouped by disagreement.

### 4. `snapshots.ts` — tier-gated counter snapshots

⭐ **THE TIER GATE LIVES HERE AND NOWHERE ELSE.** ⭐ Aggregate reconciled claims
into `counter_snapshots` as a low/high RANGE (min/max across disagreeing sources),
with `primary_source_ids`. Filter to `discovery_tier IN COUNTABLE_TIERS` (import
the constant / use `isCountableTier`) and `origin_type IN ('search_discovered',
'institutional_direct')`. Extraction runs on everything; only counting is gated —
so if Person B's tiering lags, the counter just temporarily undercounts, it never
blocks extraction. Map claims to `counter_key` per `claim_types.md` §1.

### 5. API endpoints (`api/counters.ts`) — Tier A

- `GET /counters` → latest snapshot per `counter_key`.
- `GET /counters/:key/breakdown` → join `claims → raw_items → sources` for that
  counter (same tier gate), returning each claim's `value`, `raw_quote`, source
  `{name, tier, domain}`, `url`, `date`. This is the credibility drilldown the
  floor page renders.

## Tier B (do NOT start until Tier A is green)

- `geocode.ts` (Nominatim), `zones.ts` (attack/evacuation zones from prose).
- `api/timeline.ts`, `api/map.ts`, `api/event.ts`, `api/entity.ts`.
- Entity extraction + linking (`entities`, `claim_entities`) for profile pages.

## Required tests (`pipeline.test.ts`) — 4 already real, 6 to convert

The pure-helper tests (verbatim + disagreement) are **already passing**. Convert
these `.todo`s to real DB-touching tests as you implement:

- **T1**: a non-verbatim `raw_quote` is rejected + never inserted at the DB
  boundary; a verbatim one is inserted.
- **T2**: 15 vs 20 casualty claims → `event.has_disagreement=true` AND both
  claims remain unmodified (append-only proof).
- **T3**: two agreeing claims → no disagreement flag.
- **T4**: a zod-invalid value (e.g. `count` as string) is rejected before insert,
  logged, never coerced.
- **T5**: clustering groups two same-event claims from different sources into one
  event.
- **T6**: a failed (timeout/429) LLM call leaves `processed=false`; a completed
  call yielding zero valid claims sets `processed=true`.

Mock the LLM in tests — never hit the live API from a test.

## Definition of done

`pnpm run pipeline` against `seed.ts` produces ≥3 events, ≥1 with
`has_disagreement=true`, 100% of stored `claims.raw_quote` pass the verbatim
check, and all six tests are real + green.

## Notes

- Use `serviceClient()` in the pipeline; `anonClient()` is for the API layer.
- Prompts live in `prompts/*.md` — iterate there, not inline.
- The `run.ts` orchestrator already calls the four Tier A steps in order.
- At demo time, actively hunt for a REAL discovered disagreement (two real
  outlets, different counts, same date) — it's a far stronger answer to "is that
  real or seeded?" than the seed pair. Get real data flowing through the
  disagreement path well before the final hour.
