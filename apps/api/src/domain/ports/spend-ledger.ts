import type { LocalDate } from '../shared/local-date.js';
import type { Principal } from '../shared/principal.js';

import type { ModelUsage } from './language-model.js';

/**
 * What has been spent on the model, per principal and per day.
 *
 * A counter and nothing else: which day it is comes from the `Clock` port and
 * what the ceiling is comes from the cost controls, so neither is decided
 * here. That keeps the whole policy in one place above this port and leaves
 * the implementation with nothing to get wrong.
 *
 * **Keyed by {@link Principal}**, which is a tautology while there is one
 * user — and is the point. A global counter would need a schema change and a
 * backfill to become per-user; a keyed one needs a different constant.
 */
export interface SpendLedger {
  /** Tokens this principal has spent on that day. Zero when it spent none. */
  spentOn(principal: Principal, day: LocalDate): Promise<number>;
  record(
    principal: Principal,
    day: LocalDate,
    usage: ModelUsage,
  ): Promise<void>;
}

/**
 * Input and output together. They are priced differently, but a ceiling is
 * worth having only if it is one number a person can state, and input is the
 * larger share of every turn here — the whole transcript is resent each time.
 */
export function tokensOf(usage: ModelUsage): number {
  return usage.inputTokens + usage.outputTokens;
}
