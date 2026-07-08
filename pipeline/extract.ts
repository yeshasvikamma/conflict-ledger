// =============================================================================
// pipeline/extract.ts — LLM claim extraction  [Person C]
// =============================================================================
// For each unprocessed raw_items row, call the LLM (forced JSON), validate with
// zod against the value-shape for the returned claim_type, reject any claim
// whose raw_quote is not a verbatim substring of raw_text, insert the survivors.
//
// TWO FAILURE MODES — do NOT conflate them (pipeline.test.ts T6):
//   • LLM call COMPLETED (got a response, even if every claim was rejected)
//       -> set processed = true. Retrying won't help; a bad quote stays bad.
//   • LLM call FAILED to complete (timeout / 429 / network)
//       -> leave processed = false and log. The row was never evaluated;
//          marking it processed would silently drop the article forever.
//
// COST CAP: never process more than MAX_EXTRACT_PER_RUN rows per invocation.
//
// Owns writes to: claims (insert), raw_items.processed (update, that column only).
// =============================================================================

import { VALUE_SCHEMA } from './valueSchemas.ts';
import type { ClaimType } from '../shared/constants.ts';

/** The shape the LLM is asked to return for each extracted claim. */
export interface ExtractedClaim {
  claim_type: ClaimType;
  value: unknown; // validated against VALUE_SCHEMA[claim_type] before insert
  raw_quote: string; // must be a verbatim substring of the article raw_text
  date_occurred: string | null;
  location: string | null;
}

/**
 * True iff `quote` appears verbatim inside `rawText`. This is the single most
 * important correctness check in the project — a claim that fails it is NEVER
 * inserted (pipeline.test.ts T1).
 *
 * Provided fully-implemented because it's small, pure, and heavily tested.
 * You may normalize whitespace on BOTH sides if scraped text is messy, but the
 * check must remain strict enough that a hallucinated quote fails.
 */
export function isVerbatimSubstring(quote: string, rawText: string): boolean {
  if (!quote || !rawText) return false;
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
  return normalize(rawText).includes(normalize(quote));
}

/**
 * Validate one extracted claim's value against its claim_type schema.
 * Returns the parsed value on success, or null on failure (caller logs + skips).
 */
export function validateClaimValue(claim: ExtractedClaim): unknown | null {
  const schema = VALUE_SCHEMA[claim.claim_type];
  if (!schema) return null;
  const result = schema.safeParse(claim.value);
  return result.success ? result.data : null;
}

/**
 * Process up to MAX_EXTRACT_PER_RUN unprocessed raw_items.
 *
 * TODO(Person C):
 *   1. read MAX_EXTRACT_PER_RUN from env (default 20)
 *   2. select unprocessed raw_items (processed=false), limit to the cap
 *   3. detect content_shape (prose vs structured) -> pick prompt
 *   4. call the LLM in forced-JSON mode with prompts/extract_claim.md
 *   5. for each returned claim:
 *        - validateClaimValue(); if null -> log + skip
 *        - isVerbatimSubstring(raw_quote, raw_text); if false -> log + skip
 *        - insert into claims (is_unverified_signal = (origin_type === 'x'))
 *   6. failure-mode handling:
 *        - call completed  -> update processed=true
 *        - call threw/timeout/429 -> leave processed=false, log, continue
 */
export async function runExtraction(): Promise<void> {
  throw new Error('runExtraction not implemented — see pipeline/AGENT.md');
}
