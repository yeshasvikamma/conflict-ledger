# Claim Value-Shape Contract (FROZEN)

This is the single highest-leverage file in the project. The disagreement check
is meaningless without it — you cannot detect that two claims disagree unless the
shape of a claim's `value` is pinned down first.

**Write/lock this before any pipeline code. Person C builds `disagreement.ts`
directly against the predicate in §2.**

---

## 1. Value shapes per claim_type

Every `claims.value` (jsonb) MUST match the shape for its `claim_type` exactly.
Person C validates this with zod before insert; a value that fails its shape is
rejected and logged, never coerced.

| claim_type          | value shape                                                                                                               | counter_key                                                   | Tier |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---- |
| `journalist_killed` | `{ count: number, names: string[] }`                                                                                      | `journalists_killed`                                          | A    |
| `casualty_count`    | `{ count: number, group: "palestinian"\|"israeli"\|"unknown", subtype: "civilian"\|"child"\|"combatant"\|"total"\|null }` | `palestinians_killed` / `israelis_killed` / `children_killed` | A    |
| `aid_worker_killed` | `{ count: number, org: string\|null }`                                                                                    | `aid_workers_killed`                                          | B    |
| `hostage_status`    | `{ count: number, status: "held"\|"released"\|"deceased" }`                                                               | `hostages_remaining`                                          | B    |
| `wounded_count`     | `{ count: number, group: string }`                                                                                        | `wounded`                                                     | B    |
| `displacement`      | `{ count: number, region: string\|null }`                                                                                 | `displaced`                                                   | B    |
| `strike`            | `{ target_desc: string, region: string }`                                                                                 | (map only, no counter)                                        | B    |

**Tier A implements only `journalist_killed` and `casualty_count`.** The rest
are defined now so the schema and downstream logic never change shape later.
Do NOT add claim types beyond this list under time pressure. If a new kind of
fact shows up in the data during Tier A, store what fits and handle the new type
in Tier B — never improvise a new shape mid-Tier-A.

### counter_key mapping (how casualty_count fans out)

`casualty_count` produces different `counter_key`s depending on its
discriminators, when `snapshots.ts` aggregates:

- `group="palestinian"`, `subtype` in {`total`, `null`} → `palestinians_killed`
- `group="israeli"`, `subtype` in {`total`, `null`} → `israelis_killed`
- any `group`, `subtype="child"` → `children_killed`

(`combatant`/`civilian` splits are stored but only surfaced in Tier B detail
views; the top-line counters use total/child as above.)

---

## 2. Disagreement predicate (DETERMINISTIC — memorize this)

Two claims **disagree** if and only if **all** of the following hold:

1. same `claim_type`, **and**
2. `date_occurred` overlaps within **±1 day**, **and**
3. same `location` / region, **and**
4. same value-shape discriminators:
   - for `casualty_count`: same `group` **and** same `subtype`
   - for `journalist_killed`: their `names` arrays overlap (share ≥1 name)
   - (Tier B types follow the same principle on their own discriminators)
     **and**
5. different `count`

When the predicate fires:

- both claims are stored (they already are — claims are append-only),
- both are linked to **one** `events` row via `event_claims`,
- that event's `has_disagreement` is set `true`,
- a short human-readable `disagreement_note` is written
  (e.g. `"Source A reports 15 killed on 2024-05-01; Source B reports 20 for the same day/location."`),
- the framing pass (Tier B) fires later to enrich it.

**Claims are NEVER averaged, NEVER silently dropped, NEVER overwritten.**

This predicate is a plain structured-field comparison. It does **not** use
embeddings. Embeddings (in `cluster.ts`) only _group candidate claims_ into the
same event; this predicate is what actually _decides disagreement_, and it must
stay a simple deterministic function, not a fuzzy similarity score.

---

## 3. Worked examples (use these as test fixtures)

**Disagreement (fires):**

```
claim 1: { claim_type: "casualty_count", date_occurred: "2024-05-01",
           location: "Rafah", value: { count: 15, group: "palestinian", subtype: "total" } }
claim 2: { claim_type: "casualty_count", date_occurred: "2024-05-01",
           location: "Rafah", value: { count: 20, group: "palestinian", subtype: "total" } }
=> same type, same date, same location, same group+subtype, different count
=> DISAGREE. Both kept. Event gets has_disagreement=true.
```

**No disagreement — different subtype (does NOT fire):**

```
claim 1: { ..., value: { count: 15, group: "palestinian", subtype: "total" } }
claim 2: { ..., value: { count: 4,  group: "palestinian", subtype: "child" } }
=> different subtype => these are about different quantities => NO disagreement.
```

**No disagreement — agreeing values (does NOT fire):**

```
claim 1: { ..., value: { count: 15, group: "palestinian", subtype: "total" } }
claim 2: { ..., value: { count: 15, group: "palestinian", subtype: "total" } }
=> same count => agreement, not disagreement.
```

**Journalist disagreement (fires):**

```
claim 1: { claim_type: "journalist_killed", date_occurred: "2024-05-01",
           value: { count: 3, names: ["A. Khan", "B. Okoro", "C. Diaz"] } }
claim 2: { claim_type: "journalist_killed", date_occurred: "2024-05-02",
           value: { count: 4, names: ["A. Khan", "D. Silva"] } }
=> date within ±1 day, names overlap ("A. Khan"), different count => DISAGREE.
```
