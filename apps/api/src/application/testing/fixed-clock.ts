import type { Clock } from '../../domain/ports/clock.js';

/**
 * A clock stopped at one instant. Time in a test is an input like any other:
 * every cycle boundary depends on the date, so a suite that reads the real
 * clock passes today and fails on the 31st.
 */
export class FixedClock implements Clock {
  private constructor(private readonly instant: Date) {}

  static at(instant: string | Date): FixedClock {
    return new FixedClock(new Date(instant));
  }

  now(): Date {
    return new Date(this.instant);
  }
}
