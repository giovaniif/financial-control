import { Account } from '../../domain/budgeting/account.js';
import type { PaydayAnchor } from '../../domain/budgeting/cycle-ref.js';
import { CycleRef } from '../../domain/budgeting/cycle-ref.js';
import { Cycle, Estimates } from '../../domain/budgeting/cycle.js';
import type { Clock } from '../../domain/ports/clock.js';
import type { HolidayCalendar } from '../../domain/ports/holiday-calendar.js';
import type {
  AccountRepository,
  CycleRepository,
  SettingsRepository,
} from '../../domain/ports/repositories.js';
import { LocalDate } from '../../domain/shared/local-date.js';

/** Where a cycle sits relative to today. */
export const CyclePosition = {
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

/** The rolling window the app holds: the current cycle and eleven ahead. */
export const WINDOW = 12;

/**
 * UC-3.3 — the twelve cycles the header navigates.
 *
 * Closing balances chain across the whole window, so the twelfth reflects the
 * eleven before it. A month nobody has touched still appears, carrying the
 * balance it would open with.
 */
export class ListCycles {
  constructor(
    private readonly cycles: CycleRepository,
    private readonly settings: SettingsRepository,
    private readonly accounts: AccountRepository,
    private readonly holidays: HolidayCalendar,
    private readonly clock: Clock,
  ) {}

  async rollingWindow(
    estimates: Estimates = Estimates.Included,
  ): Promise<readonly CycleSummaryView[]> {
    const today = LocalDate.fromInstant(this.clock.now());
    const anchor = await this.settings.load();
    const refs = CycleRef.rolling(
      currentMonth(today, anchor, this.holidays),
      WINDOW,
      anchor,
      this.holidays,
    );

    // Before the first cycle closes there is no previous closing balance to
    // carry in, so the window opens on what is actually in the accounts.
    let opening = Account.totalOf(await this.accounts.findAll());
    const summaries: CycleSummaryView[] = [];

    for (const ref of refs) {
      const stored = await this.cycles.findByMonth(ref);
      const cycle =
        stored === undefined
          ? Cycle.open({ id: ref.month, ref, openingBalance: opening })
          : stored.withOpeningBalance(opening);

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
 * today. Everything after it is projected, and the one immediately after is
 * the "next" the Dashboard speaks about.
 */
function positionOf(ref: CycleRef, today: LocalDate): CyclePosition {
  if (ref.contains(today)) {
    return CyclePosition.Current;
  }
  if (ref.previous().contains(today)) {
    return CyclePosition.Next;
  }
  return CyclePosition.Projected;
}

/**
 * The month of the cycle *containing* today, which is not today's calendar
 * month on the days before payday: on 3 September, with payday on the 5th,
 * the user is still in the August cycle.
 */
function currentMonth(
  today: LocalDate,
  anchor: PaydayAnchor,
  holidays: HolidayCalendar,
): string {
  const ref = CycleRef.forMonth(monthOf(today), anchor, holidays);

  return today.isBefore(ref.start) ? ref.previous().month : ref.month;
}

function monthOf(date: LocalDate): string {
  return `${String(date.year)}-${String(date.month).padStart(2, '0')}`;
}
