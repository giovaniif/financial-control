import type { Clock } from '../../domain/ports/clock.js';
import type { ModelUsage } from '../../domain/ports/language-model.js';
import type { SpendLedger } from '../../domain/ports/spend-ledger.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import { LocalDate } from '../../domain/shared/local-date.js';
import type { Principal } from '../../domain/shared/principal.js';

/**
 * Raised when the day's token ceiling has been reached. Like
 * `LanguageModelUnavailable`, it is a state the app is expected to be in
 * rather than a failure: the assistant is quiet, everything else works, and
 * the message says which.
 */
export class SpendCeilingReached extends DomainError {}

/**
 * The ceiling the app itself can see.
 *
 * Prepaid credits with auto-reload off are the real backstop — nothing can
 * spend more than the balance — but that backstop has no granularity and one
 * bad failure mode: a runaway loop burns the balance in an afternoon, and the
 * first symptom is the app going dead with no explanation. Counting here
 * turns that into a bounded daily loss with a legible message, and gives an
 * honest answer to what a month costs.
 *
 * Every caller that reaches a model holds one of these and asks before it
 * calls. **Refusing after the call would defeat the whole point**, so `check`
 * runs before the request goes out and `record` after it comes back.
 */
export class SpendCeiling {
  constructor(
    private readonly ledger: SpendLedger,
    private readonly clock: Clock,
    private readonly maxTokensPerDay: number,
  ) {}

  async check(principal: Principal): Promise<void> {
    const spent = await this.ledger.spentOn(principal, this.today());
    if (spent < this.maxTokensPerDay) return;

    throw new SpendCeilingReached(
      `The assistant has spent the ${this.maxTokensPerDay.toLocaleString('en-US')} tokens one day allows, so it is switched off until tomorrow. Everything else in the app works without it.`,
    );
  }

  async record(principal: Principal, usage: ModelUsage): Promise<void> {
    await this.ledger.record(principal, this.today(), usage);
  }

  private today(): LocalDate {
    return LocalDate.fromInstant(this.clock.now());
  }
}
