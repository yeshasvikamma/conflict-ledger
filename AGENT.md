# AGENT.md — Root (read this first, every session)

You are working on **Live Conflict Ledger**, a 3-person, ~2-day hackathon project.
This file governs the whole repo. Each track folder has its own `AGENT.md` with
the specifics of that track — read the root file (this one) plus the one for the
folder you own. Do not read or edit other tracks' folders.

## The one-paragraph product

A live, self-updating conflict tracker built like a **ledger**, not a news feed.
A few hard counters (e.g. "journalists killed") are backed number-by-number by
real articles and exact quoted sentences — never a hand-typed number. Sources
are discovered dynamically (no hardcoded outlet list, one documented CPJ
exception), rated by published third-party reliability data, and when two
trusted sources disagree the system **shows both** rather than averaging or
picking one. Only sufficiently-trusted sources count toward a displayed number;
everything else (including X/Grok signal) is shown separately, labeled
unverified, and never counted.

## The two non-negotiables (memorize)

1. **`shared/claim_types.md` is the contract.** It defines the `value` shape per
   claim type and the exact deterministic disagreement predicate. It is already
   written and FROZEN. The disagreement check — the project's best demo moment —
   is meaningless without it. Do not diverge from it.
2. **`scripts/seed.ts` is a full vertical slice**, not flat mock articles. It
   inserts sources _with tiers_, quotable raw_items, and a deliberately
   conflicting pair. This is what lets all three tracks build independently from
   hour 0. It is already written. Run `pnpm run seed` after applying the schema.

## Tier discipline (the single most important rule)

The build has two strict tiers. **Zero hours go to Tier B until Tier A passes
`pnpm test` cleanly and the floor page works end-to-end on real data.**

- **Tier A (the floor):** discovery → tiering → extraction → deterministic
  disagreement → one tier-gated counter → 3 API endpoints
  (`/counters`, `/counters/:key/breakdown`, `/sources`) → the ugly floor page.
  If nothing else ships, Tier A alone is a complete, honest, demoable product.
- **Tier B (the visuals):** map, extra counters, styled vitals bar, timeline
  scroll-rewind, divergence view, entity profiles. Fun to build, and exactly why
  you must not start it early.

Anything in the code marked `Tier B` stays untouched until Tier A is green.

## The frozen contract — do not edit without team sign-off

These files are the shared surface. Changing one can break another track's
running code, and in a multi-terminal setup nobody hears you say "I'm editing
schema." So: **do not edit any of these unless the human running the project has
explicitly approved it in this session.** If a task seems to require changing
one, STOP and surface it to the human instead of editing.

- `shared/schema.sql` — the DB. If it changes, `shared/types.ts` must be
  regenerated in the SAME commit (`supabase gen types typescript ... > shared/types.ts`).
- `shared/constants.ts` — the enums. This is the ONE seam where a typo silently
  breaks the chain. **Never hand-type a string that lives here** (`'established'`,
  `'x'`, `'search_discovered'`, etc.) — always import the constant.
- `shared/claim_types.md` — the value-shape + disagreement contract.
- `shared/supabaseClient.ts` — the client factory.

## Ownership — write only your own tables

Communication between tracks is **only through the database**. No track imports
another track's implementation code. Each track writes only to its own tables;
reads are unrestricted.

| Track                | Owns folder(s)              | Writes to (tables)                                                                                                    |
| -------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Discovery (Person A) | `discovery/`                | `sources` (insert), `raw_items` (insert)                                                                              |
| Tiering (Person B)   | `tiering/`, `signal/`       | `sources` (update `discovery_tier`,`tier_reason` only), `sources`+`raw_items` (insert, for `x` signal)                |
| Pipeline (Person C)  | `pipeline/`, most of `api/` | `claims`, `events`, `event_claims`, `entities`, `claim_entities`, `zones`, `counter_snapshots`, `raw_items.processed` |
| API / Web            | `api/`, `web/`              | read-only                                                                                                             |

If you think you need a column another track owns, that's a `shared/schema.sql`
change → surface to the human, don't edit silently.

## Golden rules for extraction (applies to any track calling an LLM)

- Forced JSON / structured output only. Never free-text parsing with regex.
- Validate every LLM response with zod before it touches the DB. Failed
  validation logs the raw response and skips the row — never insert malformed data.
- Prompts live in versioned files (`pipeline/prompts/*.md`), not inline strings.
- **`raw_quote` must be a verbatim substring of the source `raw_text`.** A claim
  that fails this is rejected, never inserted. This is the project's core
  integrity guarantee.
- **Claims are append-only.** Never update, delete, average, or overwrite a
  claim to resolve a disagreement. Disagreement makes new rows + an event flag.

## Cost discipline

- Discovery interval is a config value: `DISCOVERY_INTERVAL_SECONDS` (30 for dev,
  300–600 for the unattended demo run). Not a hardcoded constant, not a debate.
- Extraction is capped: `MAX_EXTRACT_PER_RUN` (default 20). Never process more
  than this per invocation. An uncapped extraction loop left running overnight is
  a genuinely unbounded LLM bill.

## Tooling / conventions

- **All TypeScript.** Node 20+. pnpm, single lockfile at root.
- Run everything from the repo root. Scripts: see `README.md` §Run commands.
- `pnpm test` (vitest) must be green before you push. `pnpm run typecheck` and
  `pnpm run format:check` should also pass.
- Direct pushes to `main` are fine (small team, one repo) — but never push a
  broken build. Run `pnpm test` locally first, every time.
- Tests for each track start as `.todo` markers describing exactly what to build.
  Convert them to real passing tests as you implement — do not delete them.

## What "done" means

Each track's `AGENT.md` states its definition of done and its required tests.
The whole-project definition of done is in `README.md` §Definition of done.
When in doubt, prefer the smallest change that makes your track's tests real and
green — then stop.
