import { describe, expect, it } from 'vitest';

import type { HolidayCalendar } from '../ports/holiday-calendar.js';
import { noHolidays } from '../ports/holiday-calendar.js';
import { LocalDate } from '../shared/local-date.js';
import {
  CycleRef,
  InvalidAnchor,
  PaydayAnchor,
  ShiftPolicy,
} from './cycle-ref.js';

const date = (iso: string) => LocalDate.parse(iso);

/** A calendar holding exactly the dates it is given. */
const holidaysOn = (...isoDates: string[]): HolidayCalendar => ({
  isHoliday: (d) => isoDates.includes(d.toISO()),
});

const anchor = (day: number, policy: ShiftPolicy = ShiftPolicy.Preceding) =>
  PaydayAnchor.of(day, policy);

const forMonth = (
  iso: string,
  paydayAnchor = anchor(5),
  calendar = noHolidays,
) => CycleRef.forMonth(iso, paydayAnchor, calendar);

describe('PaydayAnchor', () => {
  it.each([0, 32, 5.5])('rejects an anchor day of %s', (day) => {
    expect(() => PaydayAnchor.of(day, ShiftPolicy.Preceding)).toThrow(
      InvalidAnchor,
    );
  });

  it('accepts every day a month can have', () => {
    expect(PaydayAnchor.of(1, ShiftPolicy.Preceding).dayOfMonth).toBe(1);
    expect(PaydayAnchor.of(31, ShiftPolicy.Preceding).dayOfMonth).toBe(31);
  });
});

// A cycle is named for the month AFTER its payday, so the cycle a given
// month's pay opens is named for the month following it.
describe('CycleRef anchor resolution', () => {
  it('opens on the anchor day when it is an ordinary weekday', () => {
    // 5 Aug 2026 is a Wednesday, and that pay covers September.
    expect(forMonth('2026-09').start.toISO()).toBe('2026-08-05');
  });

  it.each([
    ['a Saturday moves back to the Friday', '2026-10', '2026-09-04'],
    ['a Sunday moves back to the Friday', '2026-05', '2026-04-03'],
  ])('%s', (_name, month, expected) => {
    // 5 Sep 2026 is a Saturday; 5 Apr 2026 is a Sunday.
    expect(forMonth(month).start.toISO()).toBe(expected);
  });

  it('moves forward instead under the FOLLOWING policy', () => {
    const following = anchor(5, ShiftPolicy.Following);

    expect(forMonth('2026-10', following).start.toISO()).toBe('2026-09-07');
    expect(forMonth('2026-05', following).start.toISO()).toBe('2026-04-06');
  });

  it('moves off a public holiday just as it moves off a weekend', () => {
    // 1 May 2026 is a Friday and Labour Day, so pay lands on Thursday.
    const calendar = holidaysOn('2026-05-01');

    expect(forMonth('2026-06', anchor(1), calendar).start.toISO()).toBe(
      '2026-04-30',
    );
  });

  it('skips a run of consecutive non-business days', () => {
    // Fri 25 Dec and Thu 24 Dec blocked, plus the weekend before: back to Wed 23.
    const calendar = holidaysOn('2026-12-25', '2026-12-24');

    expect(forMonth('2027-01', anchor(25), calendar).start.toISO()).toBe(
      '2026-12-23',
    );
  });

  it.each([
    ['February in a common year', '2026-03', '2026-02-27'],
    ['February in a leap year', '2028-03', '2028-02-29'],
    ['a 30-day month', '2026-05', '2026-04-30'],
  ])('clamps an anchor of 31 onto the last day of %s', (_name, month, iso) => {
    // 28 Feb 2026 is a Saturday, so the clamped date shifts back again to the 27th.
    expect(forMonth(month, anchor(31)).start.toISO()).toBe(iso);
  });
});

describe('CycleRef boundaries and naming', () => {
  it('ends the day before the next cycle starts', () => {
    const august = forMonth('2026-08');

    // August's own payday opens September's cycle, so August closes the day
    // before it — and 5 Aug 2026 is a Wednesday, so nothing shifts.
    expect(august.end.toISO()).toBe('2026-08-04');
  });

  it('is named for the month after its payday, not the one pay lands in', () => {
    const august = forMonth('2026-08');

    // 5 Jul 2026 is a Sunday, so July's pay lands on Friday the 3rd.
    expect(august.start.toISO()).toBe('2026-07-03');
    expect(august.label).toBe('Agosto de 2026');
  });

  // The span moves with the anchor while the name stays put, which is the
  // whole point: an anchor late in the month makes the cycle sit almost
  // entirely inside the month it is named for.
  it.each([
    ['an anchor of 31', 31, '2026-07-31', '2026-08-30'],
    ['an anchor of 5', 5, '2026-07-03', '2026-08-04'],
    ['an anchor of 1', 1, '2026-07-01', '2026-07-30'],
  ])('spans %s', (_name, day, start, end) => {
    const august = forMonth('2026-08', anchor(day));

    expect(august.start.toISO()).toBe(start);
    expect(august.end.toISO()).toBe(end);
  });

  it('keeps its name even when pay lands two months before it', () => {
    // Anchor 1 May is a holiday, so pay lands 30 April — the June cycle.
    const calendar = holidaysOn('2026-05-01');
    const june = forMonth('2026-06', anchor(1), calendar);

    expect(june.start.toISO()).toBe('2026-04-30');
    expect(june.label).toBe('Junho de 2026');
  });

  it('exposes its span as an inclusive range', () => {
    const august = forMonth('2026-08');

    expect(august.range.start.equals(august.start)).toBe(true);
    expect(august.range.end.equals(august.end)).toBe(true);
  });

  it('rejects a month it cannot parse', () => {
    expect(() => forMonth('August 2026')).toThrow(InvalidAnchor);
    expect(() => forMonth('2026-13')).toThrow(InvalidAnchor);
  });
});

describe('CycleRef.contains — the assignment rule', () => {
  const august = forMonth('2026-08');

  // With pay on the 5th, the August cycle runs 3 Jul – 4 Aug.
  it.each([
    ['the first day', '2026-07-03', true],
    ['a day in the middle', '2026-07-20', true],
    ['the last day', '2026-08-04', true],
    ['the day before it opens', '2026-07-02', false],
    ['the day the next cycle opens', '2026-08-05', false],
  ])('%s', (_name, iso, expected) => {
    expect(august.contains(date(iso))).toBe(expected);
  });

  // UC-5.4: an invoice belongs to the cycle containing its DUE date, not the
  // dates of the purchases on it. Two purchases nine days apart, on either
  // side of the card's closing day, are a whole cycle apart in cash terms.
  it('puts an invoice due 10 Sep in the October cycle', () => {
    const october = forMonth('2026-10');

    expect(october.contains(date('2026-09-10'))).toBe(true);
    expect(forMonth('2026-09').contains(date('2026-09-10'))).toBe(false);
  });

  it('puts an invoice due 10 Oct in the November cycle', () => {
    const november = forMonth('2026-11');

    expect(november.contains(date('2026-10-10'))).toBe(true);
    expect(forMonth('2026-10').contains(date('2026-10-10'))).toBe(false);
  });
});

describe('CycleRef equality', () => {
  it('compares by the month it names and the span it resolved to', () => {
    expect(forMonth('2026-08').equals(forMonth('2026-08'))).toBe(true);
    expect(forMonth('2026-08').equals(forMonth('2026-09'))).toBe(false);
  });

  it('renders its bounds, never a bare month name', () => {
    expect(forMonth('2026-08').toString()).toBe(
      'Agosto de 2026 (2026-07-03 – 2026-08-04)',
    );
  });
});

describe('CycleRef.dateForDayOfMonth', () => {
  const refFor = (month: string, day: number) =>
    CycleRef.forMonth(month, anchor(day), noHolidays);

  /**
   * A day past the end of a short month falls on that month's last day — the
   * same clamping the anchor itself uses. Refusing it would make an anchor of
   * 31 unusable, because half its cycles open in a 30-day month.
   */
  it.each([
    ['clamps onto a 30-day month', '2026-10', 31, '2026-09-30'],
    ['clamps onto February', '2027-03', 31, '2027-02-28'],
    [
      'takes the day as written when the month is long enough',
      '2026-11',
      31,
      '2026-10-31',
    ],
    ['finds the day in the closing month', '2026-10', 29, '2026-10-29'],
  ])('%s', (_name, month, day, expected) => {
    expect(refFor(month, 31).dateForDayOfMonth(day)?.toISO()).toBe(expected);
  });

  /**
   * A genuine gap: the August cycle runs 31 Aug – 29 Sep, so a 30th belongs to
   * neither month it spans. Placing it anyway would move a bill into a cycle
   * the user did not choose, so it has none.
   */
  it('has no date for a day the cycle never reaches', () => {
    expect(refFor('2026-09', 31).dateForDayOfMonth(30)).toBeUndefined();
  });

  it('resolves every day of the month for a mid-month anchor', () => {
    const ref = refFor('2026-08', 5);

    for (let day = 1; day <= 31; day += 1) {
      expect(ref.dateForDayOfMonth(day)).toBeDefined();
    }
  });
});
