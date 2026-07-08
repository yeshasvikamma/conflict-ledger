# AGENT.md — Signal track (Person B, "The Judge") — part 2 of 3

Read the root `AGENT.md` first. This file covers the `signal/` folder. See
`tiering/AGENT.md` for your other backend job.

## Your job in one line

Pull X/social posts via Grok as a separate "unverified chatter" layer — shown
separately as color/context, **never counted** in any real number.

## What you own (this part)

- Folder: `signal/`
- Tables you WRITE: `sources` (insert, `source_type='x'`), `raw_items` (insert,
  `origin_type='x'`).
- Tables you READ: `sources` (dedup).

## Files

- `grok.ts` — `grokSearch(query)`: query the Grok API for recent X posts on a
  query, return `SignalPost[]`. Query-driven, not a fixed account list
  (consistent with "no anchors").
- `run.ts` — pick a few queries (you can reuse Person A's narrative queries),
  call `grokSearch`, upsert a `sources` row per post-source with
  `source_type='x'`, upsert `raw_items` with `origin_type='x'` (dedup on `url`).

## The one thing that actually matters here

This data must be **impossible to count**. The enforcement is downstream:
Person C's counter query filters by tier AND origin type. Your only job is to
**tag correctly** so that filter works — `source_type='x'`, `origin_type='x'`,
every time. If you tag one row wrong, unverified chatter could leak into a
counted number. That's the whole risk of this track; there is no other.

## Required tests (`signal.test.ts`) — convert from `.todo`

- **T1**: every row inserted by `grok.ts` has `origin_type='x'`, never
  `'search_discovered'`.
- **T2** (the important one): a query filtering
  `origin_type IN ('search_discovered','institutional_direct')` excludes every
  X-origin row. This is the guarantee that signal can't leak into a counter.

## Definition of done (this part)

A test run of `grok.ts` produces ≥10 correctly tagged rows; both tests real + green.

## Notes

- Use `serviceClient()`. Import `origin_type`/`source_type` strings from
  `shared/constants.ts` — never hand-type `'x'`.
- Person C sets `claims.is_unverified_signal = true` for claims from these rows;
  you don't need to touch claims at all.
