import { describe, expect, it, vi } from 'vitest';

import { SystemClock } from './system-clock.js';

describe('SystemClock', () => {
  it('reads the real wall clock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T12:00:00Z'));

    expect(new SystemClock().now()).toEqual(new Date('2026-07-30T12:00:00Z'));

    vi.useRealTimers();
  });
});
