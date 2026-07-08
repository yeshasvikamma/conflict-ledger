# CONTEXT.md — Architecture & rationale

Reference doc for anyone (human or agent) who wants the "why" behind the
structure. `AGENT.md` tells you what to do; this tells you why it's shaped that
way. Read `AGENT.md` first; this is background.

## The core idea

The product's defensibility comes from **not deciding what's true**. It doesn't
pick one outlet as correct. Instead:

1. **Discovers sources dynamically** — searches the web via Bright Data, evaluates
   whatever real sites show up. No hardcoded "good sources" list (one documented
   CPJ exception, because CPJ publishes structured primary data the flagship
   counter depends on).
2. **Rates sources** using published third-party reliability data (MBFC/Ad
   Fontes), not our own opinion.
3. **Extracts atomic facts** from articles, each pinned to an exact verbatim
   quote. No quote → no stored fact.
4. **Shows disagreement instead of resolving it.** When two trusted sources give
   different numbers for the same fact, both are kept and shown side by side. This
   is the most interesting, most honest, and most demo-friendly feature.
5. **Gates counting by trust.** Only sufficiently-trusted sources count toward a
   displayed number. Everything else (incl. X/Grok) is shown separately, labeled
   unverified, never counted.

## Data flow

```
[SERP discovery] → [new domain?] → [source tiering] → [Web Unlocker scrape]
      → [raw_items] → [shape-detect] → [LLM extraction] → [claims (append-only)]
      → [embedding clustering] → [events]
      → [deterministic disagreement check] → [events.has_disagreement]
      → [tier-gated aggregation] → [counter_snapshots] → [read API] → [frontend]
```

Grok/X signal enters as `raw_items` tagged `origin_type='x'`, flows through
extraction for display, but is excluded from every counter by the tier gate.

## Why the seams are where they are

- **Tracks communicate only through the DB.** No cross-track code imports. This
  is what lets three people (or three agents in three terminals) build in parallel
  without a shared code surface to fight over. The only shared files are in
  `shared/` and they're frozen.
- **The tier gate lives in exactly one place** (`pipeline/snapshots.ts`).
  Extraction runs on everything regardless of tier; only the counting step
  filters. This deliberately decouples the counter from tiering speed — if tiering
  lags or is briefly wrong, the counter undercounts temporarily but extraction is
  never blocked.
- **Claims are append-only.** Disagreement never mutates a claim — it creates a
  new claim row (already there) and flags an event. This makes the audit trail
  incorruptible: every number traces to immutable rows with verbatim quotes.
- **The value-shape contract (`claim_types.md`) is written first** because the
  disagreement predicate is defined entirely in terms of it. You cannot detect
  that two claims disagree without a pinned shape to compare. Writing it first is
  what makes the whole reconciliation layer buildable against a fixed contract.
- **The seed is a full vertical slice** (sources _with tiers_ + quotable
  raw_items + a conflicting pair), not flat articles. This removes the last
  blocking dependency: Person C can build+test the entire
  extract→disagree→count→API path before Person A or B write real ingestion.

## The disagreement predicate (the money demo)

Two claims disagree iff: same `claim_type`, `date_occurred` within ±1 day, same
location, same value-shape discriminators (group+subtype for casualties; names
overlap for journalists), and different `count`. Deterministic field comparison,
NOT embeddings. Embeddings only group candidate claims into events; this predicate
decides disagreement. Full spec + worked examples: `shared/claim_types.md`.

## Honest scope notes

- **"Land taken / territorial control" is NOT built** as an authoritative map.
  That data lives in specialist sources (ISW/ACLED), not daily news prose, and
  would eat the weekend. What IS built (Tier B) is a `zones` layer of _reported_
  attack/evacuation regions extracted from prose, clearly labeled as reported —
  not a control map.
- **Structured extraction (CPJ, casualty lists) is a bonus, not the floor.** The
  counter's reliability rests on the prose path; a clean structured source
  improves accuracy when discovered but is never required.
- **"Unbiased" via transparency, not arbitration.** The defensible pitch is
  radical source transparency (who says what, with tiers + methodology + ranges),
  not a single authoritative count. On this topic the numbers themselves are
  contested; never present one authoritative figure.

## Tier A vs Tier B (and why the order is load-bearing)

Tier A is the smallest thing that proves the entire thesis: one tier-gated counter
that clicks through to real verbatim quotes, plus one visible disagreement. It's a
complete demo alone. Tier B is the visual payload (map, vitals bar, timeline,
divergence view) that makes it memorable. The visuals are more fun to build, which
is exactly why the discipline is to not touch them until Tier A is green — a
working floor beats an unfinished ceiling in every judging room.
