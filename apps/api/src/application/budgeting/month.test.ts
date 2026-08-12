import { describe, expect, it } from 'vitest';

import { PaydayAnchor, ShiftPolicy } from '../../domain/budgeting/cycle-ref.js';
import type { HolidayCalendar } from '../../domain/ports/holiday-calendar.js';
import { noHolidays } from '../../domain/ports/holiday-calendar.js';
import { LocalDate } from '../../domain/shared/local-date.js';

import { calendarMonthOf, monthOf } from './month.js';

const anchor = (day: number) => PaydayAnchor.of(day, ShiftPolicy.Preceding);

const monthFor = (iso: string, day = 5) =>
  monthOf(LocalDate.parse(iso), anchor(day), noHolidays);

/**
 * A cycle is named for the month after its payday, so with pay on the 5th the
 * August 2026 cycle runs 3 Jul – 4 Aug and September's runs 5 Aug – 3 Sep. A
 * date therefore lands in a cycle named for its own calendar month, the one
 * before, or the one after, depending on which side of payday it falls.
 */
describe('monthOf', () => {
  it.each([
    ['the day a cycle opens', '2026-07-03', '2026-08'],
    ['a day in the middle', '2026-07-20', '2026-08'],
    ['the day a cycle closes', '2026-08-04', '2026-08'],
  ])('%s belongs to that cycle', (_name, iso, expected) => {
    expect(monthFor(iso)).toBe(expected);
  });

  // The two directions the lookup has to roll. The cycle named for a date's
  // own calendar month is only sometimes the one containing it.
  it('rolls forward when the date is past that cycle', () => {
    // 5 Aug opens the September cycle, though its calendar month is August.
    expect(monthFor('2026-08-05')).toBe('2026-09');
  });

  // Rolling back needs a cycle that opens inside the very month it is named
  // for, which only FOLLOWING can produce: 28 Feb 2027 is a Sunday and 1 March
  // is blocked, so February's pay is pushed all the way to 2 March.
  it('rolls back when the date is before that cycle opens', () => {
    const followingLateAnchor = PaydayAnchor.of(31, ShiftPolicy.Following);
    const blocked: HolidayCalendar = {
      isHoliday: (d) => d.toISO() === '2027-03-01',
    };

    expect(
      monthOf(LocalDate.parse('2027-03-01'), followingLateAnchor, blocked),
    ).toBe('2027-02');
  });

  it('puts the day before payday in the cycle that is ending', () => {
    expect(monthFor('2026-09-03')).toBe('2026-09');
    expect(monthFor('2026-09-04')).toBe('2026-10');
  });

  // Under an anchor of 1 a cycle fills one calendar month exactly, and the
  // name is still the month after its payday: 1–30 Sep is the October cycle.
  it('keeps the offset when a cycle fills a single calendar month', () => {
    expect(monthFor('2026-09-01', 1)).toBe('2026-10');
    expect(monthFor('2026-09-30', 1)).toBe('2026-10');
  });

  it('reads a date back as its own calendar month', () => {
    expect(calendarMonthOf(LocalDate.parse('2026-08-05'))).toBe('2026-08');
  });
});
