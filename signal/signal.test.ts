// =============================================================================
// signal/signal.test.ts  [Person B]
// =============================================================================
// The two signal tests that define "done" (PRD §10). T2 is the important one:
// it's the actual guarantee that unverified social signal can never leak into a
// counted number.
// =============================================================================

import { describe, it } from 'vitest';

describe('signal', () => {
  // T1: every row inserted by grok.ts has origin_type = 'x', never
  // 'search_discovered'.
  it.todo("T1: all Grok rows tagged origin_type='x'");

  // T2: a query filtering origin_type IN ('search_discovered','institutional_direct')
  // excludes every X-origin row. THE leak-prevention guarantee.
  it.todo('T2: countable-origin filter excludes all x-origin rows');
});
