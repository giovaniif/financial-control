import type { PaydayAnchor } from '../../domain/budgeting/cycle-ref.js';
import { CycleRef } from '../../domain/budgeting/cycle-ref.js';
import type { HolidayCalendar } from '../../domain/ports/holiday-calendar.js';
import type { LocalDate } from '../../domain/shared/local-date.js';

/**
 * The month of the cycle *containing* a date, which is not that date's own
 * calendar month either side of payday. A cycle is named for the month it
 * ends in, so with pay on the 5th the September cycle runs 5 Aug – 3 Sep:
 * 5 August already belongs to it, and 3 September still does.
 *
 * The cycle named for the date's calendar month always ends in that month, so
 * the date is at most one cycle away in either direction.
 */
export function monthOf(
  date: LocalDate,
  anchor: PaydayAnchor,
  holidays: HolidayCalendar,
): string {
  const ref = CycleRef.forMonth(calendarMonthOf(date), anchor, holidays);

  if (date.isBefore(ref.start)) {
    return ref.previous().month;
  }
  return ref.end.isBefore(date) ? ref.next().month : ref.month;
}

export function calendarMonthOf(date: LocalDate): string {
  return `${String(date.year)}-${String(date.month).padStart(2, '0')}`;
}
