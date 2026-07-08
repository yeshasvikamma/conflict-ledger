# Live Conflict Ledger

A live, self-updating conflict tracker built like a **ledger**, not a news feed.
Hard counters (e.g. "journalists killed") are backed number-by-number by real
articles and exact quoted sentences — never a hand-typed number. Sources are
discovered dynamically, rated by published third-party reliability data, and when
trusted sources disagree the system shows both rather than picking one.

> **Agents:** read `AGENT.md` (root) first, then the `AGENT.md` in the folder you
> own. `CONTEXT.md` has the full architecture. The plan's two non-negotiables and
> the Tier A/B discipline are in `AGENT.md` — follow them.

## Stack

All TypeScript · pnpm · Supabase (Postgres) · Bright Data (SERP + Web Unlocker) ·
OpenAI (extraction + embeddings) · Grok (X signal only) · Express (read API) ·
Vite/React (Tier B frontend). Geocoding + map tiles via free OpenStreetMap.

## First-time setup (do this at kickoff, in order)

1. **Install deps** (choose pnpm; a single lockfile at root):
   ```bash
   pnpm install
   ```
2. **Create a Supabase project**, then apply the schema: open the Supabase SQL
   editor, paste the entire contents of `shared/schema.sql`, and run it.
3. **Generate real types** (replaces the placeholder `shared/types.ts`):
   ```bash
   supabase gen types typescript --project-id <your-project-id> > shared/types.ts
   ```
   Commit the regenerated file. Re-run this any time `schema.sql` changes, in the
   same commit.
4. **Fill in env**: copy `.env.example` to `.env` and fill every value. Confirm
   `.env` is gitignored (it is) before your first commit.
   ```bash
   cp .env.example .env
   ```
5. **Seed the vertical slice** so every track can build immediately:
   ```bash
   pnpm run seed
   ```
6. **Verify the scaffold is green**:
   ```bash
   pnpm test && pnpm run typecheck && pnpm run format:check
   ```

## Run commands

```bash
pnpm install
pnpm run seed        # populate the full vertical-slice mock data
pnpm run reset_db    # wipe all tables for a clean slate, then re-seed
pnpm run discovery   # Person A — one discovery cycle
pnpm run tier        # Person B — tiering pass
pnpm run signal      # Person B — Grok/X signal pull
pnpm run pipeline    # Person C — extraction + reconciliation + snapshots
pnpm run api         # serve the read API (http://localhost:8787)
pnpm run web         # serve the frontend (floor page first, then Tier B)
pnpm test            # run every track's tests + integration test
pnpm run typecheck   # tsc --noEmit
pnpm run format      # prettier --write
```

The **floor page** is `web/floor.html`. Start the API (`pnpm run api`), then open
that file in a browser (or `pnpm run web`). It proves the whole thesis: a counter
number that clicks through to its exact sourced quotes. Keep it ugly until Tier A
is locked.

## The two tiers

- **Tier A (the floor, done by ~hour 6):** discovery → tiering → extraction →
  deterministic disagreement → one tier-gated counter → `/counters`,
  `/counters/:key/breakdown`, `/sources` → the floor page. A complete demo on its own.
- **Tier B (only after Tier A is green):** map, extra counters, styled vitals bar,
  timeline scroll-rewind, divergence view, entity profiles.

**Zero hours on Tier B until Tier A passes `pnpm test` cleanly on real data.**

## Repo map

```
shared/      FROZEN contract: schema.sql, constants.ts, claim_types.md, types.ts, supabaseClient.ts
discovery/   Person A — Bright Data SERP + Web Unlocker + CPJ direct pull
tiering/     Person B — source reliability tiering (MBFC/Ad Fontes cache)
signal/      Person B — X signal via Grok (never counted)
pipeline/    Person C — extraction, disagreement, clustering, snapshots
api/         read API (thin, JSON); ownership follows table ownership
web/         floor.html (Tier A safety net) + Tier B frontend
scripts/     seed.ts (vertical slice), reset_db.ts
tests/       integration.test.ts (full chain)
```

## Ownership (write only your own tables)

| Track     | Owns                     | Writes to                                                                                                             |
| --------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Discovery | `discovery/`             | `sources` (insert), `raw_items` (insert)                                                                              |
| Tiering   | `tiering/`, `signal/`    | `sources` (`discovery_tier`,`tier_reason` update; `x` inserts), `raw_items` (`x` inserts)                             |
| Pipeline  | `pipeline/`, most `api/` | `claims`, `events`, `event_claims`, `entities`, `claim_entities`, `zones`, `counter_snapshots`, `raw_items.processed` |
| API / Web | `api/`, `web/`           | read-only                                                                                                             |

Tracks communicate ONLY through the database. Never edit `shared/*` without team
sign-off. Never hand-type a string that lives in `shared/constants.ts`.

## Definition of done (whole project)

- [ ] `pnpm test` passes clean (all track unit tests + integration test)
- [ ] Counter reflects ONLY countable tiers (institutional / wire_service /
      established); `x` and `emerging_unverified` excluded by construction
- [ ] Every counter digit clicks through to a real `raw_quote` that is a verbatim
      substring of its source's `raw_text`
- [ ] At least one `events` row with `has_disagreement=true` visibly displayed,
      showing both conflicting claims + their sources
- [ ] CPJ direct pull clearly commented as the one intentional non-discovered source
- [ ] Zero duplicate `raw_items.url` rows
- [ ] A 10–15 min unattended pipeline run immediately before demo, no crash
- [ ] `.env.example` matches every env var actually referenced in code
- [ ] Tier A was fully green before any Tier B work began
