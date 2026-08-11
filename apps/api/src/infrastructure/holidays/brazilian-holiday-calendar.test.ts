import { describe, expect, it } from 'vitest';

import { LocalDate } from '../../domain/shared/local-date.js';
import {
  BrazilianHolidayCalendar,
  easterSunday,
} from './brazilian-holiday-calendar.js';

const calendar = new BrazilianHolidayCalendar();
const isHoliday = (iso: string) => calendar.isHoliday(LocalDate.parse(iso));

describe('easterSunday', () => {
  // The moveable feasts all hang off Easter, so if this is wrong, Carnival,
  // Good Friday and Corpus Christi are all wrong with it.
  it.each([
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2028, '2028-04-16'],
    [2030, '2030-04-21'],
  ])('falls on %i-%s', (year, iso) => {
    expect(easterSunday(year).toISO()).toBe(iso);
  });
});

describe('BrazilianHolidayCalendar', () => {
  it.each([
    ['New Year', '2026-01-01'],
    ['Tiradentes', '2026-04-21'],
    ['Labour Day', '2026-05-01'],
    ['Independence', '2026-09-07'],
    ['Our Lady of Aparecida', '2026-10-12'],
    ['All Souls', '2026-11-02'],
    ['Republic Day', '2026-11-15'],
    ['Black Awareness Day', '2026-11-20'],
    ['Christmas', '2026-12-25'],
  ])('knows the fixed holiday %s', (_name, iso) => {
    expect(isHoliday(iso)).toBe(true);
  });

  it.each([
    ['Carnival Monday', '2026-02-16'],
    ['Carnival Tuesday', '2026-02-17'],
    ['Good Friday', '2026-04-03'],
    ['Corpus Christi', '2026-06-04'],
  ])('knows the moveable holiday %s', (_name, iso) => {
    expect(isHoliday(iso)).toBe(true);
  });

  it('moves the moveable ones with Easter from year to year', () => {
    expect(isHoliday('2027-03-26')).toBe(true); // Good Friday 2027
    expect(isHoliday('2027-04-03')).toBe(false); // Good Friday's 2026 date
  });

  it.each([
    ['an ordinary weekday', '2026-08-05'],
    ['Ash Wednesday, which is a working day', '2026-02-18'],
    ['Easter Sunday itself, already a Sunday', '2026-04-06'],
  ])('does not treat %s as a holiday', (_name, iso) => {
    expect(isHoliday(iso)).toBe(false);
  });

  it('answers for a year it has not been asked about before', () => {
    expect(isHoliday('2031-12-25')).toBe(true);
  });
});
