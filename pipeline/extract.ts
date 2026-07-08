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

import { readFile } from 'node:fs/promises';
import OpenAI from 'openai';
import { z } from 'zod';
import { VALUE_SCHEMA } from './valueSchemas.ts';
import {
  CLAIM_TYPES,
  CONTENT_SHAPE,
  ORIGIN_TYPE,
  type ClaimType,
} from '../shared/constants.ts';
import { serviceClient } from '../shared/supabaseClient.ts';
import type { Database, Json } from '../shared/types.ts';

const DEFAULT_MAX_EXTRACT_PER_RUN = 20;
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const [, CASUALTY_COUNT_CLAIM_TYPE] = CLAIM_TYPES;
const [JOURNALIST_KILLED_CLAIM_TYPE] = CLAIM_TYPES;
const [, STRUCTURED_CONTENT_SHAPE] = CONTENT_SHAPE;
const [, , X_ORIGIN_TYPE] = ORIGIN_TYPE;

type RawItemForExtraction = Pick<
  Database['public']['Tables']['raw_items']['Row'],
  'id' | 'raw_text' | 'headline' | 'origin_type' | 'content_shape'
>;

type ClaimInsert = Database['public']['Tables']['claims']['Insert'];

type ExtractionLogEntry = Record<string, unknown>;

export type ExtractionLogger = (entry: ExtractionLogEntry) => void;

export type ExtractionLlm = (input: {
  prompt: string;
  model: string;
  rawItem: RawItemForExtraction;
}) => Promise<string>;

export interface RunExtractionOptions {
  db?: Pick<ReturnType<typeof serviceClient>, 'from'>;
  llm?: ExtractionLlm;
  logger?: ExtractionLogger;
}

const extractedClaimSchema = z.object({
  claim_type: z.union([
    z.literal(JOURNALIST_KILLED_CLAIM_TYPE),
    z.literal(CASUALTY_COUNT_CLAIM_TYPE),
  ]),
  value: z.unknown(),
  raw_quote: z.string(),
  date_occurred: z.string().nullable(),
  location: z.string().nullable(),
});

const extractionResponseSchema = z.object({
  claims: z.array(z.unknown()),
});

const promptUrl = new URL('./prompts/extract_claim.md', import.meta.url);

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

function defaultLogger(entry: ExtractionLogEntry): void {
  console.log(JSON.stringify(entry));
}

function extractionCap(): number {
  const raw = process.env.MAX_EXTRACT_PER_RUN;
  if (!raw) return DEFAULT_MAX_EXTRACT_PER_RUN;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_MAX_EXTRACT_PER_RUN;
  return parsed;
}

function openAiModel(): string {
  return process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
}

async function loadPromptTemplate(): Promise<string> {
  return readFile(promptUrl, 'utf8');
}

function buildPrompt(template: string, rawItem: RawItemForExtraction): string {
  const filled = template
    .replaceAll('{{headline}}', rawItem.headline ?? '')
    .replaceAll('{{raw_text}}', rawItem.raw_text);

  if (rawItem.content_shape !== STRUCTURED_CONTENT_SHAPE) return filled;

  return `${filled}\n\nCONTENT SHAPE: structured. Apply the structured-source variant above.`;
}

export async function callExtractionLlm({
  prompt,
  model,
}: {
  prompt: string;
  model: string;
}): Promise<string> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI extraction response did not include message content');
  }
  return content;
}

function parseExtractionResponse(rawResponse: string): unknown[] {
  const parsed = JSON.parse(rawResponse) as unknown;
  const result = extractionResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(result.error.message);
  }
  return result.data.claims;
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { message: String(error) };
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
export async function runExtraction(options: RunExtractionOptions = {}): Promise<void> {
  const db = options.db ?? serviceClient();
  const llm = options.llm ?? callExtractionLlm;
  const logger = options.logger ?? defaultLogger;
  const cap = extractionCap();

  if (cap === 0) {
    logger({
      event: 'extraction.run_skipped',
      reason: 'max_extract_per_run_zero',
      max_extract_per_run: cap,
    });
    return;
  }

  const { data: rawItems, error: selectError } = await db
    .from('raw_items')
    .select('id, raw_text, headline, origin_type, content_shape')
    .eq('processed', false)
    .order('created_at', { ascending: true })
    .limit(cap);

  if (selectError) {
    throw selectError;
  }

  if (!rawItems || rawItems.length === 0) {
    logger({
      event: 'extraction.run_completed',
      max_extract_per_run: cap,
      raw_items_selected: 0,
    });
    return;
  }

  const promptTemplate = await loadPromptTemplate();
  const model = openAiModel();

  for (const rawItem of rawItems as RawItemForExtraction[]) {
    let rawLlmResponse: string | null = null;
    let parsedResponse = false;

    try {
      const prompt = buildPrompt(promptTemplate, rawItem);
      rawLlmResponse = await llm({ prompt, model, rawItem });
      const returnedClaims = parseExtractionResponse(rawLlmResponse);
      parsedResponse = true;

      const claimRows: ClaimInsert[] = [];
      const inserted: ExtractionLogEntry[] = [];
      const skipped: ExtractionLogEntry[] = [];

      for (const candidate of returnedClaims) {
        const parsedClaim = extractedClaimSchema.safeParse(candidate);
        if (!parsedClaim.success) {
          const skip = {
            reason: 'invalid_claim_shape',
            validation_error: parsedClaim.error.message,
          };
          skipped.push(skip);
          logger({
            event: 'extraction.claim_skipped',
            raw_item_id: rawItem.id,
            ...skip,
            raw_llm_response: rawLlmResponse,
          });
          continue;
        }

        const claim = parsedClaim.data as ExtractedClaim;
        const validatedValue = validateClaimValue(claim);
        if (validatedValue === null) {
          const skip = {
            reason: 'invalid_value',
            claim_type: claim.claim_type,
            raw_quote: claim.raw_quote,
          };
          skipped.push(skip);
          logger({
            event: 'extraction.claim_skipped',
            raw_item_id: rawItem.id,
            ...skip,
            raw_llm_response: rawLlmResponse,
          });
          continue;
        }

        if (!isVerbatimSubstring(claim.raw_quote, rawItem.raw_text)) {
          const skip = {
            reason: 'raw_quote_not_verbatim',
            claim_type: claim.claim_type,
            raw_quote: claim.raw_quote,
          };
          skipped.push(skip);
          logger({
            event: 'extraction.claim_skipped',
            raw_item_id: rawItem.id,
            ...skip,
          });
          continue;
        }

        claimRows.push({
          raw_item_id: rawItem.id,
          claim_type: claim.claim_type,
          value: validatedValue as Json,
          raw_quote: claim.raw_quote,
          date_occurred: claim.date_occurred,
          location: claim.location,
          is_unverified_signal: rawItem.origin_type === X_ORIGIN_TYPE,
        });
        inserted.push({
          claim_type: claim.claim_type,
          raw_quote: claim.raw_quote,
          date_occurred: claim.date_occurred,
          location: claim.location,
        });
      }

      if (claimRows.length > 0) {
        const { error: insertError } = await db.from('claims').insert(claimRows);
        if (insertError) throw insertError;
      }

      const { error: updateError } = await db
        .from('raw_items')
        .update({ processed: true })
        .eq('id', rawItem.id);
      if (updateError) throw updateError;

      logger({
        event: 'extraction.row_completed',
        raw_item_id: rawItem.id,
        origin_type: rawItem.origin_type,
        content_shape: rawItem.content_shape,
        extracted_count: returnedClaims.length,
        inserted_count: inserted.length,
        skipped_count: skipped.length,
        inserted,
        skipped,
      });
    } catch (error) {
      logger({
        event: 'extraction.row_failed',
        raw_item_id: rawItem.id,
        reason:
          rawLlmResponse === null
            ? 'llm_call_failed'
            : parsedResponse
              ? 'db_write_failed'
              : 'llm_response_parse_failed',
        error: serializeError(error),
        raw_llm_response: rawLlmResponse,
      });
    }
  }
}
