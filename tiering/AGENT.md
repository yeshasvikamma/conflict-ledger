# AGENT.md — Tiering track (Person B, "The Judge") — part 1 of 3

Read the root `AGENT.md` first. This file covers the `tiering/` folder. Person B
also owns `signal/` (see `signal/AGENT.md`) and, in Tier B, the frontend in
`web/`.

## Your job in one line

For every website Person A's code discovers, look it up against a published,
third-party reliability rating and record how trustworthy it is — you're
recording what an existing cited source says, not deciding bias yourself.

## What you own (this part)

- Folder: `tiering/`
- Tables you WRITE: `sources` — **only** the `discovery_tier` and `tier_reason`
  columns (update).
- Tables you READ: `sources` (poll for rows where `discovery_tier IS NULL`).
- You do NOT touch: `raw_items.raw_text`/`headline` (Person A's to write), or any
  pipeline table.

## Files

- `ratings_cache.json` — a one-time scrape of a public reliability/bias dataset
  (Media Bias/Fact Check or Ad Fontes), keyed by domain, **≥50 entries**. A small
  placeholder is committed; replace it with the real scrape at kickoff.
- `tier.ts` — `decideTier(domain)`:
  - if `domain` is in the short `WIRE_AGENCIES` set (already stubbed) →
    `wire_service`. (A wire-agency list is a CATEGORY FACT, not a curated
    "good sources" list — it classifies, it doesn't select. This is allowed.)
  - else if `domain` is in `ratings_cache.json` → `established`, with a
    `tier_reason` citing the dataset.
  - else → `emerging_unverified`, `tier_reason` = "not found in reliability dataset".
  - MUST be **fully deterministic** — no LLM call here (reproducibility/auditability).
- `run.ts` — poll `sources` where `discovery_tier IS NULL`, tier each via
  `decideTier`, write `discovery_tier` + `tier_reason`. The `IS NULL` filter makes
  it idempotent (tested T3).

## Also yours: the `/sources` API endpoint (Tier A)

`api/sources.ts` → `GET /sources` returns
`[{domain, name, tier, tier_reason, rating: {reliability, lean, methodology_url}}]`.
Join in the reliability/lean info from your cache. This is the transparency page:
who's in the system and exactly why they're rated the way they are.

## Required tests (`tiering.test.ts`) — convert from `.todo`

- **T1**: a cached domain → correct tier written, `tier_reason` non-null +
  human-readable.
- **T2**: an uncached domain → `emerging_unverified`, reason says "not found in
  reliability dataset".
- **T3**: running the tiering pass twice does not re-process already-tiered rows
  (idempotency on the `IS NULL` filter).

## Definition of done (this part)

Every `sources` row Person A's pipeline creates gets a non-null tier within one
polling cycle; `ratings_cache.json` has ≥50 domains; all three tests real + green.

## Notes

- Use `serviceClient()`. Import tier strings from `shared/constants.ts`
  (`DISCOVERY_TIER`), never hand-type `'established'`.
- `tier_reason` is human-readable on purpose — it doubles as your methodology
  note for judges. Make it a real sentence.
- After tiering + signal + `/sources` are done, you'll have slack before Tier A
  is finished elsewhere: help Person A expand `queries.json`, then move to the
  Tier B frontend once Tier A is fully green.
