// =============================================================================
// pipeline/pipeline.test.ts  [Person C]
// =============================================================================
// The six tests that define "done" (PRD §11). The pure helpers used by T1 and
// T2 (isVerbatimSubstring, claimsDisagree) are already implemented in the
// stubs, so a couple of real assertions are wired up now to prove the harness
// works. The DB-touching tests remain .todo until you implement the modules.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { isVerbatimSubstring } from './extract.ts';
import { claimsDisagree, type ClaimForCompare } from './disagreement.ts';

describe('pipeline — pure helpers (already implemented)', () => {
  it('isVerbatimSubstring: rejects a hallucinated quote, accepts a real one', () => {
    const rawText =
      'Medical officials said 15 people were killed in Rafah on Wednesday.';
    expect(isVerbatimSubstring('15 people were killed in Rafah', rawText)).toBe(true);
    expect(isVerbatimSubstring('42 people were killed in Khan Younis', rawText)).toBe(
      false,
    );
  });

  it('claimsDisagree: 15 vs 20, same day/location/discriminators => disagree', () => {
    const a: ClaimForCompare = {
      id: 'a',
      claim_type: 'casualty_count',
      date_occurred: '2024-05-01',
      location: 'Rafah',
      value: { count: 15, group: 'palestinian', subtype: 'total' },
    };
    const b: ClaimForCompare = {
      id: 'b',
      claim_type: 'casualty_count',
      date_occurred: '2024-05-01',
      location: 'Rafah',
      value: { count: 20, group: 'palestinian', subtype: 'total' },
    };
    expect(claimsDisagree(a, b)).toBe(true);
  });

  it('claimsDisagree: different subtype => NOT a disagreement', () => {
    const a: ClaimForCompare = {
      id: 'a',
      claim_type: 'casualty_count',
      date_occurred: '2024-05-01',
      location: 'Rafah',
      value: { count: 15, group: 'palestinian', subtype: 'total' },
    };
    const b: ClaimForCompare = {
      id: 'b',
      claim_type: 'casualty_count',
      date_occurred: '2024-05-01',
      location: 'Rafah',
      value: { count: 4, group: 'palestinian', subtype: 'child' },
    };
    expect(claimsDisagree(a, b)).toBe(false);
  });

  it('claimsDisagree: agreeing counts => NOT a disagreement', () => {
    const a: ClaimForCompare = {
      id: 'a',
      claim_type: 'casualty_count',
      date_occurred: '2024-05-01',
      location: 'Rafah',
      value: { count: 15, group: 'palestinian', subtype: 'total' },
    };
    const b: ClaimForCompare = { ...a, id: 'b' };
    expect(claimsDisagree(a, b)).toBe(false);
  });
});

describe('pipeline — integration (implement, then convert from todo)', () => {
  // T1: a raw_quote NOT present in raw_text is rejected + never inserted; a
  // verbatim quote is inserted. (The pure half is covered above; this is the
  // full extract.ts path with the DB.)
  it.todo('T1: extract rejects non-verbatim quote at the DB boundary');

  // T2: 15 vs 20 casualty claims -> event.has_disagreement=true AND both claims
  // remain in the DB unmodified (append-only proof).
  it.todo('T2: disagreement flags event and never mutates claims');

  // T3: two agreeing claims -> no disagreement flag.
  it.todo('T3: agreeing claims produce no disagreement flag');

  // T4: a value failing its zod schema (e.g. count as string) is rejected
  // before insert, logged, never coerced.
  it.todo('T4: zod-invalid value rejected before insert');

  // T5: cluster groups two same-event claims from different sources into one event.
  it.todo('T5: clustering groups same-event claims');

  // T6: a failed (timeout/429) LLM call leaves processed=false; a completed call
  // with zero valid claims sets processed=true.
  it.todo('T6: transient failure keeps processed=false; completed-but-empty sets true');
});
