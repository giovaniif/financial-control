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

describe('CycleRef anchor resolution', () => {
  it('starts on the anchor day when it is an ordinary weekday', () => {
    // 5 Aug 2026 is a Wednesday.
    expect(forMonth('2026-08').start.toISO()).toBe('2026-08-05');
  });

  it.each([
    ['a Saturday moves back to the Friday', '2026-09', '2026-09-04'],
    ['a Sunday moves back to the Friday', '2026-04', '2026-04-03'],
  ])('%s', (_name, month, expected) => {
    // 5 Sep 2026 is a Saturday; 5 Apr 2026 is a Sunday.
    expect(forMonth(month).start.toISO()).toBe(expected);
  });

  it('moves forward instead under the FOLLOWING policy', () => {
    const following = anchor(5, ShiftPolicy.Following);

    expect(forMonth('2026-09', following).start.toISO()).toBe('2026-09-07');
    expect(forMonth('2026-04', following).start.toISO()).toBe('2026-04-06');
  });

  it('moves off a public holiday just as it moves off a weekend', () => {
    // 1 May 2026 is a Friday and Labour Day, so pay lands on Thursday.
    const calendar = holidaysOn('2026-05-01');

    expect(forMonth('2026-05', anchor(1), calendar).start.toISO()).toBe(
      '2026-04-30',
    );
  });

  it('skips a run of consecutive non-business days', () => {
    // Fri 25 Dec and Thu 24 Dec blocked, plus the weekend before: back to Wed 23.
    const calendar = holidaysOn('2026-12-25', '2026-12-24');

    expect(forMonth('2026-12', anchor(25), calendar).start.toISO()).toBe(
      '2026-12-23',
    );
  });

  it.each([
    ['February in a common year', '2026-02', '2026-02-27'],
    ['February in a leap year', '2028-02', '2028-02-29'],
    ['a 30-day month', '2026-04', '2026-04-30'],
  ])('clamps an anchor of 31 onto the last day of %s', (_name, month, iso) => {
    // 28 Feb 2026 is a Saturday, so the clamped date shifts back again to the 27th.
    expect(forMonth(month, anchor(31)).start.toISO()).toBe(iso);
  });
});

describe('CycleRef boundaries and naming', () => {
  it('ends the day before the next cycle starts', () => {
    const august = forMonth('2026-08');

    // September's payday shifts back to Friday the 4th, so August ends on the 3rd.
    expect(august.end.toISO()).toBe('2026-09-03');
  });

  it('is named for the month its payday falls in, not the span it covers', () => {
    expect(forMonth('2026-08').label).toBe('August 2026');
  });

  it('keeps the label of its nominal month even when pay lands in the month before', () => {
    // Anchor 1 May is a holiday, so pay lands 30 April — still the May cycle.
    const calendar = holidaysOn('2026-05-01');
    const may = forMonth('2026-05', anchor(1), calendar);

    expect(may.start.toISO()).toBe('2026-04-30');
    expect(may.label).toBe('May 2026');
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

  it.each([
    ['the first day', '2026-08-05', true],
    ['a day in the middle', '2026-08-20', true],
    ['the last day', '2026-09-03', true],
    ['the day before it opens', '2026-08-04', false],
    ['the day the next cycle opens', '2026-09-04', false],
  ])('%s', (_name, iso, expected) => {
    expect(august.contains(date(iso))).toBe(expected);
  });

  // UC-5.4: an invoice belongs to the cycle containing its DUE date, not the
  // dates of the purchases on it. Two purchases nine days apart, on either
  // side of the card's closing day, are a whole cycle apart in cash terms.
  it('puts an invoice due 10 Sep in the September cycle', () => {
    const september = forMonth('2026-09');

    expect(september.contains(date('2026-09-10'))).toBe(true);
    expect(august.contains(date('2026-09-10'))).toBe(false);
  });

  it('puts an invoice due 10 Oct in the October cycle', () => {
    const october = forMonth('2026-10');

    expect(october.contains(date('2026-10-10'))).toBe(true);
    expect(forMonth('2026-09').contains(date('2026-10-10'))).toBe(false);
  });
});

describe('CycleRef equality', () => {
  it('compares by the month it names and the span it resolved to', () => {
    expect(forMonth('2026-08').equals(forMonth('2026-08'))).toBe(true);
    expect(forMonth('2026-08').equals(forMonth('2026-09'))).toBe(false);
  });

  it('renders its bounds, never a bare month name', () => {
    expect(forMonth('2026-08').toString()).toBe(
      'August 2026 (2026-08-05 – 2026-09-03)',
    );
  });
});
