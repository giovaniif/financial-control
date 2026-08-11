import type { HealthResponse } from '@fin/contracts';
import { describe, expect, it } from 'vitest';

import { ConfigurePaydayAnchor } from '../../../application/budgeting/uc-1-1-configure-payday-anchor.js';
import {
  InMemoryCycleRepository,
  InMemorySettingsRepository,
} from '../../../application/testing/fakes.js';
import type { Clock } from '../../../domain/ports/clock.js';
import { noHolidays } from '../../../domain/ports/holiday-calendar.js';
import { buildServer } from '../server.js';

/** The health route needs no settings; this just satisfies the wiring. */
const anchorFor = (clock: Clock) =>
  new ConfigurePaydayAnchor(
    new InMemorySettingsRepository(),
    new InMemoryCycleRepository(),
    noHolidays,
    clock,
  );

/** Returns each instant in turn, then repeats the last one. */
function fixedClock(...instants: string[]): Clock {
  const queue = instants.map((instant) => new Date(instant));
  let call = 0;
  return {
    now: () => queue[Math.min(call++, queue.length - 1)] ?? new Date(0),
  };
}

describe('GET /health', () => {
  it('answers 200', async () => {
    const clock = fixedClock('2026-07-30T12:00:00Z');
    const app = buildServer({ clock, configureAnchor: anchorFor(clock) });

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
  });

  it('reports the seconds the process has been up', async () => {
    const clock = fixedClock('2026-07-30T12:00:00Z', '2026-07-30T12:00:42Z');
    const app = buildServer({ clock, configureAnchor: anchorFor(clock) });

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.json<HealthResponse>()).toEqual({
      status: 'ok',
      uptimeSeconds: 42,
    });
  });
});
