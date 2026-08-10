import { describe, expect, it } from 'vitest';

import type { HolidayCalendar } from '../ports/holiday-calendar.js';
import { noHolidays } from '../ports/holiday-calendar.js';
import { LocalDate } from '../shared/local-date.js';
import { CycleRef, PaydayAnchor, ShiftPolicy } from './cycle-ref.js';

const POLICIES = [ShiftPolicy.Preceding, ShiftPolicy.Following];
const EVERY_ANCHOR_DAY = Array.from({ length: 31 }, (_, i) => i + 1);

/** A dense calendar, to prove a shift can never open a gap between cycles. */
const manyHolidays: HolidayCalendar = {
  isHoliday: (d) => [1, 2, 15, 16, 25, 30].includes(d.day),
};

const anchorOn = (day: number, policy: ShiftPolicy) =>
  PaydayAnchor.of(day, policy);

/** `count` consecutive cycles starting at `2026-01`. */
function consecutive(
  count: number,
  anchor: PaydayAnchor,
  holidays: HolidayCalendar = noHolidays,
): CycleRef[] {
  return Array.from({ length: count }, (_, i) => {
    const month = LocalDate.of(2026, 1, 1).plusMonths(i);
    const label = `${String(month.year)}-${String(month.month).padStart(2, '0')}`;

    return CycleRef.forMonth(label, anchor, holidays);
  });
}

describe('CycleRef.next and previous', () => {
  it('walks forward to the following month', () => {
    const august = CycleRef.forMonth(
      '2026-08',
      anchorOn(5, ShiftPolicy.Preceding),
      noHolidays,
    );

    expect(august.next().month).toBe('2026-09');
  });

  it('walks backward to the preceding month', () => {
    const august = CycleRef.forMonth(
      '2026-08',
      anchorOn(5, ShiftPolicy.Preceding),
      noHolidays,
    );

    expect(august.previous().month).toBe('2026-07');
  });

  it.each([
    ['forward across a year boundary', '2026-12', '2027-01'],
    ['backward across a year boundary', '2027-01', '2026-12'],
  ])('walks %s', (name, from, expected) => {
    const cycle = CycleRef.forMonth(
      from,
      anchorOn(5, ShiftPolicy.Preceding),
      noHolidays,
    );
    const moved = name.startsWith('forward') ? cycle.next() : cycle.previous();

    expect(moved.month).toBe(expected);
  });

  it('round-trips: the next cycle back is where it started', () => {
    const august = CycleRef.forMonth(
      '2026-08',
      anchorOn(5, ShiftPolicy.Preceding),
      noHolidays,
    );

    expect(august.next().previous().equals(august)).toBe(true);
  });
});

describe('CycleRef.rolling', () => {
  it('produces the twelve the app holds', () => {
    const window = CycleRef.rolling(
      '2026-08',
      12,
      anchorOn(5, ShiftPolicy.Preceding),
      noHolidays,
    );

    expect(window).toHaveLength(12);
    expect(window[0]?.month).toBe('2026-08');
    expect(window[11]?.month).toBe('2027-07');
  });

  it('tiles the window with no gap', () => {
    const window = CycleRef.rolling(
      '2026-08',
      12,
      anchorOn(5, ShiftPolicy.Preceding),
      noHolidays,
    );

    for (const [i, cycle] of window.slice(1).entries()) {
      expect(window[i]?.end.plusDays(1).toISO()).toBe(cycle.start.toISO());
    }
  });

  it('rejects a window of no cycles', () => {
    expect(() =>
      CycleRef.rolling(
        '2026-08',
        0,
        anchorOn(5, ShiftPolicy.Preceding),
        noHolidays,
      ),
    ).toThrow();
  });
});

// If cycles do not tile the calendar exactly, an entry can belong to two
// cycles or to none, and every balance downstream of it is wrong. These run
// across every anchor day and both policies rather than a handful of examples.
describe('the tiling invariant', () => {
  describe.each(POLICIES)('under the %s policy', (policy) => {
    it.each(EVERY_ANCHOR_DAY)(
      'leaves no gap between consecutive cycles anchored on day %i',
      (day) => {
        const cycles = consecutive(36, anchorOn(day, policy));

        for (const [i, cycle] of cycles.slice(1).entries()) {
          expect(cycles[i]?.end.plusDays(1).toISO()).toBe(cycle.start.toISO());
        }
      },
    );

    it.each(EVERY_ANCHOR_DAY)(
      'never lets a cycle anchored on day %i end before it starts',
      (day) => {
        for (const cycle of consecutive(36, anchorOn(day, policy))) {
          expect(cycle.end.isBefore(cycle.start)).toBe(false);
        }
      },
    );

    it.each(EVERY_ANCHOR_DAY)(
      'still tiles on day %i when holidays crowd the shift',
      (day) => {
        const cycles = consecutive(24, anchorOn(day, policy), manyHolidays);

        for (const [i, cycle] of cycles.slice(1).entries()) {
          expect(cycles[i]?.end.plusDays(1).toISO()).toBe(cycle.start.toISO());
        }
      },
    );
  });

  it('assigns every day of a three-year span to exactly one cycle', () => {
    const anchor = anchorOn(5, ShiftPolicy.Preceding);
    const cycles = consecutive(37, anchor);
    const [first] = cycles;
    const last = cycles.at(-1);
    if (first === undefined || last === undefined) {
      throw new Error('expected a populated window');
    }

    // Walk every day the window covers and count the cycles claiming it.
    for (let day = first.start; !day.isAfter(last.end); day = day.plusDays(1)) {
      const owners = cycles.filter((cycle) => cycle.contains(day));

      expect(owners).toHaveLength(1);
    }
  });
});
