import { DomainError } from './domain-error.js';

export class InvalidDate extends DomainError {}

const ISO = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/;
const MS_PER_DAY = 86_400_000;

/**
 * A calendar day with no time and no timezone.
 *
 * A payday on the 5th is the 5th everywhere; using a `Date` for it means the
 * machine's timezone can silently shift a cycle boundary onto the day before,
 * moving every entry that lands on it into the wrong cycle. All arithmetic
 * goes through UTC epoch days, which have no such hazard.
 */
export class LocalDate {
  private constructor(
    readonly year: number,
    readonly month: number,
    readonly day: number,
  ) {}

  static of(year: number, month: number, day: number): LocalDate {
    const whole = [year, month, day].every((part) =>
      Number.isSafeInteger(part),
    );
    if (!whole || month < 1 || month > 12) {
      throw new InvalidDate(
        `Não é uma data do calendário: ${String(year)}-${String(month)}-${String(day)}.`,
      );
    }
    if (day < 1 || day > LocalDate.lastDayOfMonth(year, month)) {
      throw new InvalidDate(
        `${String(year)}-${String(month)} não tem dia ${String(day)}.`,
      );
    }
    return new LocalDate(year, month, day);
  }

  static parse(iso: string): LocalDate {
    const groups = ISO.exec(iso)?.groups;
    if (groups === undefined) {
      throw new InvalidDate(`Não é uma data ISO: "${iso}".`);
    }
    return LocalDate.of(
      Number(groups['year']),
      Number(groups['month']),
      Number(groups['day']),
    );
  }

  /** The UTC calendar day of an instant, as handed out by the `Clock` port. */
  static fromInstant(instant: Date): LocalDate {
    return LocalDate.of(
      instant.getUTCFullYear(),
      instant.getUTCMonth() + 1,
      instant.getUTCDate(),
    );
  }

  static lastDayOfMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  /** A property rather than a method, so it can be passed straight to `sort`. */
  static readonly compare = (a: LocalDate, b: LocalDate): number =>
    a.epochDay - b.epochDay;

  private get epochDay(): number {
    return Date.UTC(this.year, this.month - 1, this.day) / MS_PER_DAY;
  }

  private static fromEpochDay(epochDay: number): LocalDate {
    return LocalDate.fromInstant(new Date(epochDay * MS_PER_DAY));
  }

  plusDays(days: number): LocalDate {
    return LocalDate.fromEpochDay(this.epochDay + days);
  }

  minusDays(days: number): LocalDate {
    return this.plusDays(-days);
  }

  /**
   * Clamps onto the last day of the target month, so 31 January plus a month
   * is 28 February rather than rolling into March.
   */
  plusMonths(months: number): LocalDate {
    const zeroBased = this.year * 12 + (this.month - 1) + months;
    const year = Math.floor(zeroBased / 12);
    const month = (zeroBased % 12) + 1;

    return LocalDate.of(
      year,
      month,
      Math.min(this.day, LocalDate.lastDayOfMonth(year, month)),
    );
  }

  daysUntil(other: LocalDate): number {
    return other.epochDay - this.epochDay;
  }

  /** Sunday is 0, Saturday is 6. */
  get dayOfWeek(): number {
    return new Date(this.epochDay * MS_PER_DAY).getUTCDay();
  }

  get isWeekend(): boolean {
    return this.dayOfWeek === 0 || this.dayOfWeek === 6;
  }

  equals(other: LocalDate): boolean {
    return this.epochDay === other.epochDay;
  }

  isBefore(other: LocalDate): boolean {
    return this.epochDay < other.epochDay;
  }

  isAfter(other: LocalDate): boolean {
    return this.epochDay > other.epochDay;
  }

  toISO(): string {
    const month = String(this.month).padStart(2, '0');
    const day = String(this.day).padStart(2, '0');

    return `${String(this.year).padStart(4, '0')}-${month}-${day}`;
  }

  toString(): string {
    return this.toISO();
  }
}
