import { CycleRef } from '../../domain/budgeting/cycle-ref.js';
import type { Cycle } from '../../domain/budgeting/cycle.js';
import { Estimates } from '../../domain/budgeting/cycle.js';
import type { Clock } from '../../domain/ports/clock.js';
import type { HolidayCalendar } from '../../domain/ports/holiday-calendar.js';
import type {
  AccountRepository,
  CycleRepository,
  SettingsRepository,
} from '../../domain/ports/repositories.js';
import { Account } from '../../domain/budgeting/account.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import { LocalDate } from '../../domain/shared/local-date.js';
import type { Money } from '../../domain/shared/money.js';
import { monthOf } from './month.js';
import { CycleNotFound } from './uc-3-ledger-actions.js';

export class CycleNotOverYet extends DomainError {}

/** One later cycle whose opening balance a reopen would move. */
export interface DownstreamShift {
  readonly month: string;
  readonly currentOpeningCents: number;
  readonly recomputedOpeningCents: number;
}

export interface ReopenPreview {
  readonly month: string;
  readonly shifts: readonly DownstreamShift[];
}

const WINDOW = 12;

/**
 * UC-3.8, UC-3.9 — freezing a cycle and undoing it.
 *
 * Closing pushes the closing balance forward as the next cycle's opening.
 * Reopening therefore invalidates every later opening balance, which is why
 * it previews what moves before it moves anything: reopening a cycle from
 * four cycles back shifts the whole cash curve since.
 */
export class CloseCycle {
  constructor(
    private readonly cycles: CycleRepository,
    private readonly settings: SettingsRepository,
    private readonly accounts: AccountRepository,
    private readonly holidays: HolidayCalendar,
    private readonly clock: Clock,
  ) {}

  /** Offered once the cycle's end date has passed, never forced. */
  async close(month: string): Promise<void> {
    const { cycle, ref } = await this.require(month);
    const today = LocalDate.fromInstant(this.clock.now());

    if (!today.isAfter(ref.end)) {
      throw new CycleNotOverYet(
        `${ref.label} runs until ${ref.end.toISO()}; it cannot be closed yet.`,
      );
    }

    await this.cycles.save(cycle.close());
    await this.rechainFrom(ref);
  }

  /** What reopening would move, without moving anything. */
  async previewReopen(month: string): Promise<ReopenPreview> {
    const { ref } = await this.require(month);

    return { month: ref.month, shifts: await this.shiftsAfter(ref) };
  }

  async reopen(month: string): Promise<ReopenPreview> {
    const { cycle, ref } = await this.require(month);
    const preview = await this.previewReopen(month);

    await this.cycles.save(cycle.reopen());
    await this.rechainFrom(ref);

    return preview;
  }

  /**
   * Writes each later cycle's opening balance from the one before it, so the
   * chain agrees with what actually happened.
   */
  private async rechainFrom(ref: CycleRef): Promise<void> {
    for (const shift of await this.walkForward(ref)) {
      await this.cycles.save(shift.cycle);
    }
  }

  private async shiftsAfter(ref: CycleRef): Promise<DownstreamShift[]> {
    return (await this.walkForward(ref))
      .filter(
        (step) => step.currentOpening.cents !== step.cycle.openingBalance.cents,
      )
      .map((step) => ({
        month: step.cycle.ref.month,
        currentOpeningCents: step.currentOpening.cents,
        recomputedOpeningCents: step.cycle.openingBalance.cents,
      }));
  }

  /** Each stored cycle after `ref`, with the opening balance it should carry. */
  private async walkForward(
    ref: CycleRef,
  ): Promise<{ cycle: Cycle; currentOpening: Money }[]> {
    const anchor = await this.settings.load();
    const start = monthOf(
      LocalDate.fromInstant(this.clock.now()),
      anchor,
      this.holidays,
    );
    const window = CycleRef.rolling(start, WINDOW, anchor, this.holidays);
    const previous = await this.cycles.findByMonth(ref);

    let opening =
      previous?.closingBalance(Estimates.Included) ??
      Account.totalOf(await this.accounts.findAll());
    const steps: { cycle: Cycle; currentOpening: Money }[] = [];

    for (const later of window.filter(
      (candidate) => candidate.month > ref.month,
    )) {
      const stored = await this.cycles.findByMonth(later);
      if (stored === undefined) {
        continue;
      }

      steps.push({
        cycle: stored.withOpeningBalance(opening),
        currentOpening: stored.openingBalance,
      });
      opening = stored.withOpeningBalance(opening).closingBalance();
    }

    return steps;
  }

  private async require(
    month: string,
  ): Promise<{ cycle: Cycle; ref: CycleRef }> {
    const anchor = await this.settings.load();
    const ref = CycleRef.forMonth(month, anchor, this.holidays);
    const cycle = await this.cycles.findByMonth(ref);

    if (cycle === undefined) {
      throw new CycleNotFound(`The ${ref.label} cycle has nothing in it yet.`);
    }
    return { cycle, ref };
  }
}
