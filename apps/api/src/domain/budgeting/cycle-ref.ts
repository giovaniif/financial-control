import type { HolidayCalendar } from '../ports/holiday-calendar.js';
import { DateRange } from '../shared/date-range.js';
import { DomainError } from '../shared/domain-error.js';
import { LocalDate } from '../shared/local-date.js';

export class InvalidAnchor extends DomainError {}

const MONTH = /^(?<year>\d{4})-(?<month>\d{2})$/;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** Which way pay moves when the anchor lands on a non-business day. */
export const ShiftPolicy = {
  Preceding: 'PRECEDING',
  Following: 'FOLLOWING',
} as const;

export type ShiftPolicy = (typeof ShiftPolicy)[keyof typeof ShiftPolicy];

/** The configured payday: a day of the month, and how it dodges a closed bank. */
export class PaydayAnchor {
  private constructor(
    readonly dayOfMonth: number,
    readonly shiftPolicy: ShiftPolicy,
  ) {}

  static of(dayOfMonth: number, shiftPolicy: ShiftPolicy): PaydayAnchor {
    if (
      !Number.isSafeInteger(dayOfMonth) ||
      dayOfMonth < 1 ||
      dayOfMonth > 31
    ) {
      throw new InvalidAnchor(
        `A payday anchor is a day of the month; received ${String(dayOfMonth)}.`,
      );
    }
    return new PaydayAnchor(dayOfMonth, shiftPolicy);
  }

  equals(other: PaydayAnchor): boolean {
    return (
      this.dayOfMonth === other.dayOfMonth &&
      this.shiftPolicy === other.shiftPolicy
    );
  }
}

/**
 * One payday cycle: salary date through the day before the next salary date.
 *
 * **The app does not think in calendar months.** With pay on the 5th the
 * August 2026 cycle runs 3 Jul → 4 Aug, because that is how the money is
 * actually experienced: an amount arrives and must cover everything until the
 * next amount arrives. It is named for the month **after** its payday — the
 * month the money is actually spent in.
 *
 * The resolution rules live here and nowhere else, and so does
 * {@link CycleRef.contains} — the single implementation of the rule that
 * decides which cycle an entry belongs to.
 */
export class CycleRef {
  private constructor(
    /** The month the cycle is named for, as `YYYY-MM`. */
    readonly month: string,
    readonly start: LocalDate,
    readonly end: LocalDate,
    readonly anchor: PaydayAnchor,
    /** Kept so a neighbouring cycle resolves under the same rules. */
    private readonly holidays: HolidayCalendar,
  ) {}

  /**
   * The cycle named for `month`: it opens on the **previous** month's payday
   * and closes the day before this month's.
   *
   * A cycle is named for the month the money is spent in rather than the month
   * it arrives in. With pay on the last day of the month, 31 Jul → 30 Aug is
   * *August* — which is what the money is for, and what every bill on it is
   * dated.
   *
   * The offset is applied to the *nominal* month, never derived from the dates
   * the cycle resolved to, and that is load-bearing. Naming by the resolved
   * end date, or by whichever month holds most of the days, both break the
   * one-cycle-per-month mapping: 2 May 2026 is a Saturday, so with pay on the
   * 2nd two cycles end in April and none in May; with pay on the 16th,
   * February is short enough that no cycle falls mostly inside it. Offsetting
   * the nominal month cannot collide or skip, because resolving a month to its
   * payday is total.
   */
  static forMonth(
    month: string,
    anchor: PaydayAnchor,
    holidays: HolidayCalendar,
  ): CycleRef {
    const { year, monthNumber } = parseMonth(month);
    const closes = LocalDate.of(year, monthNumber, 1);
    const opens = closes.plusMonths(-1);

    const start = resolveStart(opens.year, opens.month, anchor, holidays);
    const end = resolveStart(
      closes.year,
      closes.month,
      anchor,
      holidays,
    ).minusDays(1);

    return new CycleRef(month, start, end, anchor, holidays);
  }

  /** The `count` cycles starting at `month` — the rolling window the app holds. */
  static rolling(
    month: string,
    count: number,
    anchor: PaydayAnchor,
    holidays: HolidayCalendar,
  ): CycleRef[] {
    if (!Number.isSafeInteger(count) || count < 1) {
      throw new InvalidAnchor(
        `A window holds at least one cycle; received ${String(count)}.`,
      );
    }

    let cycle = CycleRef.forMonth(month, anchor, holidays);
    const window = [cycle];
    while (window.length < count) {
      cycle = cycle.next();
      window.push(cycle);
    }
    return window;
  }

  next(): CycleRef {
    return this.shifted(1);
  }

  previous(): CycleRef {
    return this.shifted(-1);
  }

  private shifted(months: number): CycleRef {
    const { year, monthNumber } = parseMonth(this.month);
    const moved = LocalDate.of(year, monthNumber, 1).plusMonths(months);
    const label = `${String(moved.year)}-${String(moved.month).padStart(2, '0')}`;

    return CycleRef.forMonth(label, this.anchor, this.holidays);
  }

  /**
   * **An entry belongs to the cycle whose range contains its due date.** For a
   * credit-card invoice the due date decides — never the dates of the
   * purchases on it. See UC-5.4.
   */
  contains(date: LocalDate): boolean {
    return this.range.contains(date);
  }

  /**
   * Where a day of the month lands inside this cycle, or nothing when the
   * cycle never reaches it.
   *
   * A day past the end of a short month falls on that month's last day — the
   * same clamping the anchor itself uses, so an anchor of 31 stays usable in
   * the months that have only 30 days. A day that belongs to neither month
   * the cycle spans has no date at all: the August cycle running 31 Aug –
   * 29 Sep never reaches a 30th, and moving one onto a boundary would file it
   * in a cycle nobody chose.
   *
   * Stated once here because two callers need it — generating a cycle from
   * its templates, and refusing an import that would generate nothing.
   */
  dateForDayOfMonth(day: number): LocalDate | undefined {
    for (const bound of [this.start, this.end]) {
      const clamped = Math.min(
        day,
        LocalDate.lastDayOfMonth(bound.year, bound.month),
      );
      const candidate = LocalDate.of(bound.year, bound.month, clamped);

      if (this.contains(candidate)) {
        return candidate;
      }
    }

    return undefined;
  }

  get range(): DateRange {
    return DateRange.of(this.start, this.end);
  }

  /** Named for the month after its payday — never `August–September`. */
  get label(): string {
    const { year, monthNumber } = parseMonth(this.month);

    return `${MONTH_NAMES[monthNumber - 1] ?? ''} ${String(year)}`;
  }

  equals(other: CycleRef): boolean {
    return (
      this.month === other.month &&
      this.start.equals(other.start) &&
      this.end.equals(other.end)
    );
  }

  toString(): string {
    return `${this.label} (${this.range.toString()})`;
  }
}

function parseMonth(month: string): { year: number; monthNumber: number } {
  const groups = MONTH.exec(month)?.groups;
  const monthNumber = Number(groups?.['month'] ?? 0);
  if (groups === undefined || monthNumber < 1 || monthNumber > 12) {
    throw new InvalidAnchor(`Not a YYYY-MM month: "${month}".`);
  }
  return { year: Number(groups['year']), monthNumber };
}

/**
 * The nominal anchor day, clamped onto the last day of a short month, then
 * shifted off any weekend or holiday by the configured policy. Consecutive
 * closed days are skipped, so a holiday abutting a weekend still lands on a
 * business day.
 */
function resolveStart(
  year: number,
  month: number,
  anchor: PaydayAnchor,
  holidays: HolidayCalendar,
): LocalDate {
  const clamped = Math.min(
    anchor.dayOfMonth,
    LocalDate.lastDayOfMonth(year, month),
  );
  const step = anchor.shiftPolicy === ShiftPolicy.Preceding ? -1 : 1;

  let resolved = LocalDate.of(year, month, clamped);
  while (resolved.isWeekend || holidays.isHoliday(resolved)) {
    resolved = resolved.plusDays(step);
  }
  return resolved;
}
