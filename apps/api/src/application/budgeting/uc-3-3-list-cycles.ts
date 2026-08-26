import { Account } from '../../domain/budgeting/account.js';
import { CycleRef } from '../../domain/budgeting/cycle-ref.js';
import { Cycle, Estimates } from '../../domain/budgeting/cycle.js';
import type { Clock } from '../../domain/ports/clock.js';
import type { HolidayCalendar } from '../../domain/ports/holiday-calendar.js';
import type {
  AccountRepository,
  BucketRepository,
  CycleRepository,
  RecurringTemplateRepository,
  SettingsRepository,
} from '../../domain/ports/repositories.js';
import { allocateInto } from '../../domain/budgeting/allocation-generation.js';
import { generateInto } from '../../domain/budgeting/template-generation.js';
import { LocalDate } from '../../domain/shared/local-date.js';
import { Money } from '../../domain/shared/money.js';
import { monthOf } from './month.js';
import { entryId } from './uc-3-1-read-cycle.js';

/** Where a cycle sits relative to today. */
export const CyclePosition = {
  Past: 'past',
  Current: 'current',
  Next: 'next',
  Projected: 'projected',
} as const;

export type CyclePosition = (typeof CyclePosition)[keyof typeof CyclePosition];

export interface CycleSummaryView {
  readonly month: string;
  readonly label: string;
  readonly start: string;
  readonly end: string;
  readonly status: Cycle['status'];
  readonly position: CyclePosition;
  readonly openingBalanceCents: number;
  readonly closingBalanceCents: number;
  readonly netSurplusCents: number;
  /** Materialised on demand, so an untouched future month is not persisted. */
  readonly isMaterialised: boolean;
}

/**
 * Whatever can say what a cycle opens on — {@link ListCycles} in production.
 *
 * Declared as a shape rather than the class so the readers that describe a
 * single cycle depend on the question, not on the window that answers it.
 */
export interface OpeningBalanceSource {
  openingBalanceOf(month: string): Promise<Money>;
}

/** The rolling projection: the current cycle and eleven ahead. */
export const WINDOW = 12;

/**
 * UC-3.3 — the cycles the header navigates.
 *
 * Twelve forward, projected from templates, plus every cycle that already
 * exists behind today so UC-3.8 and UC-3.9 have something to act on. Closing
 * balances chain across the whole window, so the last reflects all the ones
 * before it. A future month nobody has touched still appears, carrying the
 * balance it would open with; a past one only appears if it was persisted.
 */
export class ListCycles {
  constructor(
    private readonly cycles: CycleRepository,
    private readonly settings: SettingsRepository,
    private readonly accounts: AccountRepository,
    private readonly holidays: HolidayCalendar,
    private readonly clock: Clock,
    private readonly templates: RecurringTemplateRepository,
    private readonly buckets: BucketRepository,
  ) {}

  /**
   * What a cycle opens on, for readers that describe one cycle rather than
   * the window.
   *
   * Derived here rather than copied into them: until a cycle is closed there
   * is no stored closing balance to carry in, so the opening balance is a
   * fold over the whole window from what the accounts actually hold (UC-1.2).
   * Two readers already disagreed by reading the stored zero instead.
   */
  async openingBalanceOf(month: string): Promise<Money> {
    const summary = (await this.rollingWindow()).find(
      (one) => one.month === month,
    );

    return Money.fromCents(summary?.openingBalanceCents ?? 0);
  }

  async rollingWindow(
    estimates: Estimates = Estimates.Included,
  ): Promise<readonly CycleSummaryView[]> {
    const today = LocalDate.fromInstant(this.clock.now());
    const anchor = await this.settings.load();
    const currentMonth = monthOf(today, anchor, this.holidays);

    // Closing and reopening both act on a cycle whose end has passed, so the
    // window reaches behind today — but only over cycles that actually exist.
    const past = (await this.cycles.monthsBefore(currentMonth)).map((month) =>
      CycleRef.forMonth(month, anchor, this.holidays),
    );
    const refs = [
      ...past,
      ...CycleRef.rolling(currentMonth, WINDOW, anchor, this.holidays),
    ];

    // Before the first cycle closes there is no previous closing balance to
    // carry in, so the window opens on what is actually in the accounts.
    let opening = Account.totalOf(await this.accounts.findAll());
    const templates = await this.templates.findAll();
    const buckets = await this.buckets.findAll();
    const summaries: CycleSummaryView[] = [];

    for (const ref of refs) {
      const stored = await this.cycles.findByMonth(ref);
      const base =
        stored === undefined
          ? Cycle.open({ id: ref.month, ref, openingBalance: opening })
          : stored.withOpeningBalance(opening);

      // Projected from templates but never persisted: listing the window is a
      // read, and writing twelve cycles because someone opened a dropdown
      // would materialise months the user has not touched.
      // Allocations come after the templates: they apply to the Expected
      // Surplus those entries produce.
      const cycle = allocateInto(
        generateInto(base, templates, entryId).cycle,
        buckets,
      );

      const chain = cycle.chain(estimates);
      summaries.push({
        month: ref.month,
        label: ref.label,
        start: ref.start.toISO(),
        end: ref.end.toISO(),
        status: cycle.status,
        position: positionOf(ref, today),
        openingBalanceCents: chain.openingBalance.cents,
        closingBalanceCents: chain.closingBalance.cents,
        netSurplusCents: chain.netSurplus.cents,
        isMaterialised: stored !== undefined,
      });

      opening = chain.closingBalance;
    }

    return summaries;
  }
}

/**
 * Exactly one cycle is current for any given instant: the one containing
 * today. Everything before it has ended, everything after it is projected,
 * and the one immediately after is the "next" the Dashboard speaks about.
 */
function positionOf(ref: CycleRef, today: LocalDate): CyclePosition {
  if (ref.end.isBefore(today)) {
    return CyclePosition.Past;
  }
  if (ref.contains(today)) {
    return CyclePosition.Current;
  }
  if (ref.previous().contains(today)) {
    return CyclePosition.Next;
  }
  return CyclePosition.Projected;
}
