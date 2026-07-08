# Claim Extraction Prompt (Person C)

This is the versioned prompt for the LLM extraction step. Keep prompt changes in
this file (reviewable in diffs), not inline in `extract.ts`.

Use **forced JSON / structured output mode**. Never free-text parsing.

---

## System / instruction

You extract structured factual claims from a news article about an armed
conflict. Return **only** JSON matching the schema below. Extract **zero or
more** claims — zero is a valid, correct answer when the article states no
countable fact of the supported types.

### Supported claim types and value shapes

Only these types (Tier A):

- `journalist_killed` → `{ "count": number, "names": string[] }`
- `casualty_count` → `{ "count": number, "group": "palestinian"|"israeli"|"unknown", "subtype": "civilian"|"child"|"combatant"|"total"|null }`

(If you see a fact that doesn't fit these, do NOT invent a new type — omit it.)

### The one unbreakable rule: `raw_quote`

For every claim, `raw_quote` MUST be an **exact, verbatim substring** copied
character-for-character from the article text provided. Do not paraphrase, do
not fix typos, do not add or remove words. If you cannot find a single
verbatim sentence in the article that supports the claim, **do not emit that
claim.** A claim whose quote is not found verbatim in the source will be
discarded downstream, so emitting one is wasted effort.

### Other fields

- `date_occurred`: ISO `YYYY-MM-DD` if the article states/implies a date for the
  event; else `null`.
- `location`: the place the event occurred (city/region as written); else `null`.

### Output schema

```json
{
  "claims": [
    {
      "claim_type": "casualty_count",
      "value": { "count": 15, "group": "palestinian", "subtype": "total" },
      "raw_quote": "Medical officials in Rafah said on Wednesday that 15 people were killed",
      "date_occurred": "2024-05-01",
      "location": "Rafah"
    }
  ]
}
```

Return `{ "claims": [] }` if nothing qualifies.

---

## Structured-source variant (content_shape = 'structured')

If the article text is a structured/tabular list of records (e.g. a published
casualty or journalist list) rather than prose, extract one claim per record
where it maps cleanly to a supported type, still obeying the verbatim
`raw_quote` rule (quote the row/line the record came from).

---

## User message (filled in by extract.ts)

```
ARTICLE HEADLINE: {{headline}}

ARTICLE TEXT:
{{raw_text}}
```
