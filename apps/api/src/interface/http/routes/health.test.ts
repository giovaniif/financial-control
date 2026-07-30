import type { HealthResponse } from '@fin/contracts';
import { describe, expect, it } from 'vitest';

import type { Clock } from '../../../domain/ports/clock.js';
import { buildServer } from '../server.js';

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
    const app = buildServer({ clock: fixedClock('2026-07-30T12:00:00Z') });

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
  });

  it('reports the seconds the process has been up', async () => {
    const app = buildServer({
      clock: fixedClock('2026-07-30T12:00:00Z', '2026-07-30T12:00:42Z'),
    });

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.json<HealthResponse>()).toEqual({
      status: 'ok',
      uptimeSeconds: 42,
    });
  });
});
