import type { PaydayAnchor } from '../../domain/budgeting/cycle-ref.js';
import { CycleRef } from '../../domain/budgeting/cycle-ref.js';
import type { HolidayCalendar } from '../../domain/ports/holiday-calendar.js';
import type { LocalDate } from '../../domain/shared/local-date.js';

/**
 * The month of the cycle *containing* a date, which is not that date's
 * calendar month on the days before payday: on 3 September, with payday on
 * the 5th, the user is still in the August cycle.
 */
export function monthOf(
  date: LocalDate,
  anchor: PaydayAnchor,
  holidays: HolidayCalendar,
): string {
  const ref = CycleRef.forMonth(calendarMonthOf(date), anchor, holidays);

  return date.isBefore(ref.start) ? ref.previous().month : ref.month;
}

export function calendarMonthOf(date: LocalDate): string {
  return `${String(date.year)}-${String(date.month).padStart(2, '0')}`;
}
