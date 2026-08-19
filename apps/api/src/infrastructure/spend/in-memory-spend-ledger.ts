import type { ModelUsage } from '../../domain/ports/language-model.js';
import type { SpendLedger } from '../../domain/ports/spend-ledger.js';
import { tokensOf } from '../../domain/ports/spend-ledger.js';
import type { LocalDate } from '../../domain/shared/local-date.js';
import type { Principal } from '../../domain/shared/principal.js';

/** One principal's running total, for the one day it is counting. */
interface DayTotal {
  readonly day: LocalDate;
  readonly tokens: number;
}

/**
 * What has been spent on the model, held for as long as the process runs.
 *
 * Deliberately not persisted, matching the conversation and proposal stores:
 * a table would mean a schema migration — its own PR at the bottom of a stack
 * — for a count whose only consequence of being lost is that the day's
 * ceiling starts again.
 *
 * Stated plainly, that cost is: **restarting the API resets the day's spend.**
 * On one machine with one user that is a person restarting their own app, not
 * an evasion. It stops being acceptable the moment there is a second user or
 * an untrusted caller — and at that point the port is already here to put a
 * table behind.
 *
 * One row per principal, replaced when the day it holds is no longer the day
 * being recorded. That is the rollover, and it is also what keeps the map from
 * growing a row per day forever.
 */
export class InMemorySpendLedger implements SpendLedger {
  private readonly totals = new Map<string, DayTotal>();

  spentOn(principal: Principal, day: LocalDate): Promise<number> {
    const total = this.totals.get(principal.id);

    return Promise.resolve(total?.day.equals(day) === true ? total.tokens : 0);
  }

  async record(
    principal: Principal,
    day: LocalDate,
    usage: ModelUsage,
  ): Promise<void> {
    const spent = await this.spentOn(principal, day);
    this.totals.set(principal.id, { day, tokens: spent + tokensOf(usage) });
  }
}
