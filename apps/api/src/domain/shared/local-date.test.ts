import { describe, expect, it } from 'vitest';

import { InvalidDate, LocalDate } from './local-date.js';

const date = (iso: string) => LocalDate.parse(iso);

describe('LocalDate.of', () => {
  it('holds the calendar fields it was given', () => {
    const d = LocalDate.of(2026, 8, 5);

    expect([d.year, d.month, d.day]).toEqual([2026, 8, 5]);
  });

  it.each([
    ['month zero', 2026, 0, 5],
    ['month thirteen', 2026, 13, 5],
    ['day zero', 2026, 8, 0],
    ['the 31st of a 30-day month', 2026, 4, 31],
    ['the 29th of a common-year February', 2026, 2, 29],
    ['a fractional day', 2026, 8, 5.5],
  ])('rejects %s', (_name, year, month, day) => {
    expect(() => LocalDate.of(year, month, day)).toThrow(InvalidDate);
  });

  it('accepts the 29th of February in a leap year', () => {
    expect(LocalDate.of(2028, 2, 29).toISO()).toBe('2028-02-29');
  });
});

describe('LocalDate.parse', () => {
  it('reads an ISO date', () => {
    expect(date('2026-08-05').toISO()).toBe('2026-08-05');
  });

  it.each([
    ['an empty string', ''],
    ['a timestamp', '2026-08-05T12:00:00Z'],
    ['a Brazilian date', '05/08/2026'],
    ['a missing day', '2026-08'],
    ['an impossible date', '2026-02-30'],
  ])('rejects %s', (_name, input) => {
    expect(() => LocalDate.parse(input)).toThrow(InvalidDate);
  });
});

describe('LocalDate.fromInstant', () => {
  // The Clock hands out an instant; the domain reasons in calendar days. The
  // conversion reads UTC fields, so the machine's timezone can never shift a
  // payday onto the day before.
  it('reads the UTC calendar day of an instant', () => {
    const d = LocalDate.fromInstant(new Date('2026-08-05T23:30:00Z'));

    expect(d.toISO()).toBe('2026-08-05');
  });
});

describe('LocalDate arithmetic', () => {
  it('adds and subtracts days across a month boundary', () => {
    expect(date('2026-08-31').plusDays(1).toISO()).toBe('2026-09-01');
    expect(date('2026-09-01').minusDays(1).toISO()).toBe('2026-08-31');
  });

  it('adds days across a year boundary', () => {
    expect(date('2026-12-31').plusDays(1).toISO()).toBe('2027-01-01');
  });

  it('adds days across a leap day', () => {
    expect(date('2028-02-28').plusDays(1).toISO()).toBe('2028-02-29');
    expect(date('2026-02-28').plusDays(1).toISO()).toBe('2026-03-01');
  });

  it('adds months, clamping onto the last day of a shorter month', () => {
    expect(date('2026-01-31').plusMonths(1).toISO()).toBe('2026-02-28');
    expect(date('2026-08-05').plusMonths(1).toISO()).toBe('2026-09-05');
    expect(date('2026-12-05').plusMonths(1).toISO()).toBe('2027-01-05');
  });

  it('subtracts months through a negative count', () => {
    expect(date('2026-01-05').plusMonths(-1).toISO()).toBe('2025-12-05');
  });

  it('counts the days between two dates', () => {
    expect(date('2026-08-05').daysUntil(date('2026-09-04'))).toBe(30);
    expect(date('2026-08-05').daysUntil(date('2026-08-05'))).toBe(0);
    expect(date('2026-09-04').daysUntil(date('2026-08-05'))).toBe(-30);
  });

  it('never mutates the receiver', () => {
    const original = date('2026-08-05');

    original.plusDays(10);
    original.plusMonths(3);

    expect(original.toISO()).toBe('2026-08-05');
  });
});

describe('LocalDate calendar queries', () => {
  it.each([
    ['2026-08-03', 1, false], // Monday
    ['2026-08-08', 6, true], // Saturday
    ['2026-08-09', 0, true], // Sunday
  ])('knows %s is day %i of the week', (iso, weekday, weekend) => {
    expect(date(iso).dayOfWeek).toBe(weekday);
    expect(date(iso).isWeekend).toBe(weekend);
  });

  it.each([
    [2026, 1, 31],
    [2026, 2, 28],
    [2028, 2, 29],
    [2026, 4, 30],
    [2026, 12, 31],
  ])('knows %i-%i has %i days', (year, month, days) => {
    expect(LocalDate.lastDayOfMonth(year, month)).toBe(days);
  });
});

describe('LocalDate comparison', () => {
  it('compares by value, not by identity', () => {
    expect(date('2026-08-05').equals(date('2026-08-05'))).toBe(true);
    expect(date('2026-08-05').equals(date('2026-08-06'))).toBe(false);
  });

  it('orders dates', () => {
    expect(date('2026-08-05').isBefore(date('2026-08-06'))).toBe(true);
    expect(date('2026-08-06').isAfter(date('2026-08-05'))).toBe(true);
    expect(date('2026-08-05').isBefore(date('2026-08-05'))).toBe(false);
  });

  it('sorts a list chronologically', () => {
    const sorted = [date('2026-09-01'), date('2026-08-05'), date('2026-08-31')]
      .sort(LocalDate.compare)
      .map((d) => d.toISO());

    expect(sorted).toEqual(['2026-08-05', '2026-08-31', '2026-09-01']);
  });
});

describe('LocalDate rendering', () => {
  it('renders as its ISO date', () => {
    expect(date('2026-08-05').toString()).toBe('2026-08-05');
  });
});
