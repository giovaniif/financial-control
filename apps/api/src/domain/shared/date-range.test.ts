import { describe, expect, it } from 'vitest';

import { DateRange, InvalidDateRange } from './date-range.js';
import { LocalDate } from './local-date.js';

const date = (iso: string) => LocalDate.parse(iso);
const range = (start: string, end: string) =>
  DateRange.of(date(start), date(end));

// The September cycle: 5 Aug through 4 Sep, both ends included.
const august = range('2026-08-05', '2026-09-04');

describe('DateRange', () => {
  it('rejects a range that ends before it starts', () => {
    expect(() => range('2026-09-04', '2026-08-05')).toThrow(InvalidDateRange);
  });

  it('accepts a single-day range', () => {
    expect(range('2026-08-05', '2026-08-05').days).toBe(1);
  });

  it('counts both bounds in its length', () => {
    expect(august.days).toBe(31);
  });
});

describe('DateRange.contains', () => {
  it.each([
    ['the first day', '2026-08-05', true],
    ['a day in the middle', '2026-08-20', true],
    ['the last day', '2026-09-04', true],
    ['the day before it starts', '2026-08-04', false],
    ['the day after it ends', '2026-09-05', false],
  ])('%s', (_name, iso, expected) => {
    expect(august.contains(date(iso))).toBe(expected);
  });
});

describe('DateRange.overlaps', () => {
  it('does not overlap the range that starts the day after it ends', () => {
    const september = range('2026-09-05', '2026-10-04');

    expect(august.overlaps(september)).toBe(false);
    expect(september.overlaps(august)).toBe(false);
  });

  it('overlaps a range sharing a single day', () => {
    expect(august.overlaps(range('2026-09-04', '2026-10-04'))).toBe(true);
  });

  it('overlaps a range it wholly contains', () => {
    expect(august.overlaps(range('2026-08-10', '2026-08-12'))).toBe(true);
  });

  it('overlaps itself', () => {
    expect(august.overlaps(august)).toBe(true);
  });
});

describe('DateRange equality and rendering', () => {
  it('compares by value', () => {
    expect(august.equals(range('2026-08-05', '2026-09-04'))).toBe(true);
    expect(august.equals(range('2026-08-05', '2026-09-05'))).toBe(false);
  });

  it('states its actual bounds, never a bare month name', () => {
    expect(august.toString()).toBe('2026-08-05 – 2026-09-04');
  });
});
