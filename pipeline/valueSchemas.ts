// =============================================================================
// pipeline/valueSchemas.ts — zod schemas per claim_type  [Person C]
// =============================================================================
// The code form of shared/claim_types.md §1. Every LLM-produced claim value is
// validated against the schema for its claim_type BEFORE insert. A value that
// fails is rejected + logged, never coerced (pipeline.test.ts T4).
//
// Tier A: journalist_killed + casualty_count are the only ones exercised. The
// rest are defined so the contract is complete and stable.
// =============================================================================

import { z } from 'zod';
import type { ClaimType } from '../shared/constants.ts';

export const journalistKilledValue = z.object({
  count: z.number().int().nonnegative(),
  names: z.array(z.string()),
});

export const casualtyCountValue = z.object({
  count: z.number().int().nonnegative(),
  group: z.enum(['palestinian', 'israeli', 'unknown']),
  subtype: z.enum(['civilian', 'child', 'combatant', 'total']).nullable(),
});

export const aidWorkerKilledValue = z.object({
  count: z.number().int().nonnegative(),
  org: z.string().nullable(),
});

export const hostageStatusValue = z.object({
  count: z.number().int().nonnegative(),
  status: z.enum(['held', 'released', 'deceased']),
});

export const woundedCountValue = z.object({
  count: z.number().int().nonnegative(),
  group: z.string(),
});

export const displacementValue = z.object({
  count: z.number().int().nonnegative(),
  region: z.string().nullable(),
});

export const strikeValue = z.object({
  target_desc: z.string(),
  region: z.string(),
});

/** Look up the zod schema for a given claim_type. */
export const VALUE_SCHEMA: Record<ClaimType, z.ZodTypeAny> = {
  journalist_killed: journalistKilledValue,
  casualty_count: casualtyCountValue,
  aid_worker_killed: aidWorkerKilledValue,
  hostage_status: hostageStatusValue,
  wounded_count: woundedCountValue,
  displacement: displacementValue,
  strike: strikeValue,
};
