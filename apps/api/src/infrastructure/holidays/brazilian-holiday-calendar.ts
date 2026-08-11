import type { HolidayCalendar } from '../../domain/ports/holiday-calendar.js';
import { LocalDate } from '../../domain/shared/local-date.js';

/** Brazilian national holidays that fall on the same date every year. */
const FIXED: readonly [month: number, day: number][] = [
  [1, 1], // Confraternização Universal
  [4, 21], // Tiradentes
  [5, 1], // Dia do Trabalho
  [9, 7], // Independência
  [10, 12], // Nossa Senhora Aparecida
  [11, 2], // Finados
  [11, 15], // Proclamação da República
  [11, 20], // Consciência Negra — national since Lei 14.759/2023
  [12, 25], // Natal
];

/** Days from Easter Sunday to each moveable holiday. */
const MOVEABLE: readonly number[] = [
  -48, // Carnival Monday
  -47, // Carnival Tuesday
  -2, // Sexta-feira da Paixão
  60, // Corpus Christi
];

/**
 * Easter Sunday in the Gregorian calendar, by the Meeus/Jones/Butcher
 * algorithm. Every moveable holiday here is an offset from it.
 */
export function easterSunday(year: number): LocalDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const total = h + l - 7 * m + 114;

  return LocalDate.of(year, Math.floor(total / 31), (total % 31) + 1);
}

/**
 * The national holidays on which banks are closed, so salary cannot land.
 * State and municipal holidays are out of scope: the app has one user in one
 * place, and a wrong extra holiday would silently move a cycle boundary.
 */
export class BrazilianHolidayCalendar implements HolidayCalendar {
  private readonly byYear = new Map<number, Set<string>>();

  isHoliday(date: LocalDate): boolean {
    return this.holidaysIn(date.year).has(date.toISO());
  }

  private holidaysIn(year: number): Set<string> {
    const cached = this.byYear.get(year);
    if (cached !== undefined) {
      return cached;
    }

    const easter = easterSunday(year);
    const holidays = new Set([
      ...FIXED.map(([month, day]) => LocalDate.of(year, month, day).toISO()),
      ...MOVEABLE.map((offset) => easter.plusDays(offset).toISO()),
    ]);

    this.byYear.set(year, holidays);
    return holidays;
  }
}
