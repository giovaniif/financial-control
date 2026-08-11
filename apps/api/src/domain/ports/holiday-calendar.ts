import type { LocalDate } from '../shared/local-date.js';

/**
 * Whether a date is a public holiday, which the payday anchor needs: salary
 * lands on a business day, so a holiday moves the cycle boundary exactly as a
 * weekend does.
 */
export interface HolidayCalendar {
  isHoliday(date: LocalDate): boolean;
}

/** A calendar with nothing on it, for the cases where holidays are irrelevant. */
export const noHolidays: HolidayCalendar = {
  isHoliday: () => false,
};
