import { DomainError } from './domain-error.js';
import type { LocalDate } from './local-date.js';

export class InvalidDateRange extends DomainError {}

/**
 * A span of calendar days, **inclusive of both bounds** — as cycles are: the
 * August cycle runs 5 Aug through 4 Sep and owns both of those days.
 */
export class DateRange {
  private constructor(
    readonly start: LocalDate,
    readonly end: LocalDate,
  ) {}

  static of(start: LocalDate, end: LocalDate): DateRange {
    if (end.isBefore(start)) {
      throw new InvalidDateRange(
        `A range cannot end before it starts: ${start.toISO()} – ${end.toISO()}.`,
      );
    }
    return new DateRange(start, end);
  }

  contains(date: LocalDate): boolean {
    return !date.isBefore(this.start) && !date.isAfter(this.end);
  }

  overlaps(other: DateRange): boolean {
    return !this.start.isAfter(other.end) && !this.end.isBefore(other.start);
  }

  /** Inclusive of both bounds, so a single-day range is one day long. */
  get days(): number {
    return this.start.daysUntil(this.end) + 1;
  }

  equals(other: DateRange): boolean {
    return this.start.equals(other.start) && this.end.equals(other.end);
  }

  toString(): string {
    return `${this.start.toISO()} – ${this.end.toISO()}`;
  }
}
