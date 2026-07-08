# AGENT.md — Discovery track (Person A, "The Finder")

Read the root `AGENT.md` first. This file covers only the `discovery/` folder.

## Your job in one line

Go out onto the internet and find real news articles about the conflict —
without anyone hardcoding which websites to look at — then pull their full text
into the database, on a loop.

## What you own

- Folder: `discovery/`
- Tables you WRITE: `sources` (insert), `raw_items` (insert)
- Tables you READ: `sources` (to dedup by domain)
- You do NOT touch: `discovery_tier`, `tier_reason` (Person B owns those columns
  even though your code creates the row), or anything in `pipeline/`.

## Files and what goes in them

- `serp.ts` — `serpSearch(query)`: call Bright Data SERP API for one query,
  return `SerpResult[]` (`{url, domain, title}`). Extract domain from URL.
- `scrape.ts` — `scrapeUrl(url)`: call Bright Data Web Unlocker, return
  `{headline, raw_text}`. `raw_text` must be non-empty. Use the provided
  `withBackoff` helper (or your own) — **exponential backoff on 429/5xx, max 5
  retries**, then throw. This is tested (T4).
- `cpj.ts` — `fetchCpj()`: the ONE deliberate hardcoded exception. Pull CPJ's
  published journalist-casualty data. The comment block explaining why is already
  at the top of the file — keep it. Tag everything from here as
  `institutional_direct` and `discovered_via='direct:cpj'`.
- `queries.json` — rotating query list, already seeded with narrative +
  institutional queries. Expand it; never put domains in it.
- `run.ts` — the entrypoint. For each query: `serpSearch` → for each result,
  check if `domain` exists in `sources`; if new, insert a `sources` row with
  `discovered_via` = the EXACT query string → `scrapeUrl` → insert into
  `raw_items` with **`upsert ... onConflict: 'url'` (do nothing on conflict),
  never a plain insert**. Then call `fetchCpj()` once per cycle and insert those
  as `institutional_direct`.

## Required tests (`discovery.test.ts`) — convert from `.todo` to real

- **T1**: running `run.ts` twice against the same mocked SERP response inserts
  ZERO duplicate `raw_items`. (Mock serp+scrape; assert row count.)
- **T2**: a new domain is inserted with `discovered_via` = exact query string and
  `discovery_tier` null.
- **T3**: `cpj.ts` output → `source_type='institutional_direct'` and
  `raw_items.origin_type='institutional_direct'`.
- **T4**: a simulated 429 from the mocked Bright Data client triggers retry with
  backoff (assert retry count), not a crash.

Mock Bright Data in tests — never hit the live API from a test. Keep tests
deterministic and free.

## Definition of done

`pnpm run discovery` for 10 minutes unattended against live Bright Data produces
≥15 unique `raw_items` across ≥5 distinct domains, zero duplicate URLs anywhere,
and all four tests above are real and green.

## Notes / gotchas

- Use `serviceClient()` from `shared/supabaseClient.ts`.
- Import enum strings (`origin_type`, `source_type`) from `shared/constants.ts` —
  never hand-type `'search_discovered'` etc.
- `raw_items.url` has a UNIQUE constraint, so dedup is enforced by the DB too —
  but you must still use upsert so a duplicate doesn't throw.
- Once your track is green and you have slack, help Person B expand
  `queries.json` — more diverse queries = more source diversity, which matters
  since Bright Data + Grok are the only two ingestion paths.
