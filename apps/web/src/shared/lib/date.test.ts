import { describe, expect, it } from 'vitest';

import {
  formatDate,
  formatDayMonth,
  formatMonthLabel,
  formatMonthOf,
  formatRange,
  shiftMonth,
} from './date.js';

describe('formatDate', () => {
  it('renders dd/MM/yyyy', () => {
    expect(formatDate('2026-08-05')).toBe('05/08/2026');
  });

  // Read as UTC, or a machine west of Greenwich shows the day before.
  it('does not shift the day across a timezone', () => {
    expect(formatDate('2026-01-01')).toBe('01/01/2026');
    expect(formatDate('2026-12-31')).toBe('31/12/2026');
  });
});

describe('formatRange', () => {
  it('states a cycle by its bounds, never as a bare month name', () => {
    expect(formatRange('2026-08-05', '2026-09-04')).toBe('5 ago – 4 set');
  });

  it('formats a single day as day and short month', () => {
    expect(formatDayMonth('2026-02-28')).toBe('28 fev');
  });
});

describe('formatMonthLabel', () => {
  // A cycle is named for the month it is spent in, so `2026-10` has to read
  // back as the name the rest of the app calls that cycle by.
  it('names a cycle month in full', () => {
    expect(formatMonthLabel('2026-10')).toBe('Outubro de 2026');
  });

  it('does not shift the month across a timezone', () => {
    expect(formatMonthLabel('2026-01')).toBe('Janeiro de 2026');
    expect(formatMonthLabel('2026-12')).toBe('Dezembro de 2026');
  });
});

describe('formatMonthOf', () => {
  // A target date is a day, but a goal is answered in months: "reaches it in
  // Março de 2031" is the sentence UC-7.3 asks for.
  it('names the month a date falls in', () => {
    expect(formatMonthOf('2031-03-31')).toBe('Março de 2031');
  });

  it('does not shift the month across a timezone', () => {
    expect(formatMonthOf('2026-01-01')).toBe('Janeiro de 2026');
    expect(formatMonthOf('2026-12-31')).toBe('Dezembro de 2026');
  });
});

describe('shiftMonth', () => {
  it.each([
    ['forward inside the year', '2026-08', 3, '2026-11'],
    ['across the year boundary', '2026-08', 5, '2027-01'],
    ['over several years', '2026-08', 55, '2031-03'],
    ['backwards', '2026-01', -1, '2025-12'],
    ['nowhere at all', '2026-08', 0, '2026-08'],
  ])('%s', (_name, month, by, expected) => {
    expect(shiftMonth(month, by)).toBe(expected);
  });
});
