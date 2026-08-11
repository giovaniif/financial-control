import { describe, expect, it } from 'vitest';

import { FixedClock } from './fixed-clock.js';

describe('FixedClock', () => {
  it('reports the instant it was stopped at', () => {
    const clock = FixedClock.at('2026-08-05T12:00:00Z');

    expect(clock.now()).toEqual(new Date('2026-08-05T12:00:00Z'));
  });

  it('does not advance between reads', () => {
    const clock = FixedClock.at('2026-08-05T12:00:00Z');

    expect(clock.now()).toEqual(clock.now());
  });

  it('hands out a copy, so a caller cannot wind it forward', () => {
    const clock = FixedClock.at('2026-08-05T12:00:00Z');

    clock.now().setUTCFullYear(2030);

    expect(clock.now().getUTCFullYear()).toBe(2026);
  });
});
