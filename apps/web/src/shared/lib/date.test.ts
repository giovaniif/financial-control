import { describe, expect, it } from 'vitest';

import {
  formatDate,
  formatDayMonth,
  formatMonthLabel,
  formatRange,
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
    expect(formatRange('2026-08-05', '2026-09-04')).toBe('5 Aug – 4 Sep');
  });

  it('formats a single day as day and short month', () => {
    expect(formatDayMonth('2026-02-28')).toBe('28 Feb');
  });
});

describe('formatMonthLabel', () => {
  // A cycle is named for the month it is spent in, so `2026-10` has to read
  // back as the name the rest of the app calls that cycle by.
  it('names a cycle month in full', () => {
    expect(formatMonthLabel('2026-10')).toBe('October 2026');
  });

  it('does not shift the month across a timezone', () => {
    expect(formatMonthLabel('2026-01')).toBe('January 2026');
    expect(formatMonthLabel('2026-12')).toBe('December 2026');
  });
});
