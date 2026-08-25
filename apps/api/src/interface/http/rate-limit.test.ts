import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';

import type { SpendRateLimits } from './rate-limit.js';
import { describeWait } from './rate-limit.js';
import { buildTestServer } from './testing/test-server.js';

const A_MINUTE = 60_000;
const A_DAY = 24 * 60 * A_MINUTE;

/** Wide enough that only the window under test can be the one that fires. */
const OPEN = { max: 1_000, windowMs: A_MINUTE };

function serverWith(spendLimits: SpendRateLimits): FastifyInstance {
  return buildTestServer({ spendLimits });
}

const askSetup = (app: FastifyInstance) =>
  app.inject({
    method: 'POST',
    url: '/setup/conversation',
    payload: { message: 'I am paid on the 5th.' },
  });

const askAssistant = (app: FastifyInstance) =>
  app.inject({
    method: 'POST',
    url: '/assistant/messages',
    payload: { message: 'How much is left?' },
  });

async function repeat(
  times: number,
  ask: () => Promise<{ statusCode: number }>,
): Promise<number[]> {
  const codes: number[] = [];
  for (let attempt = 0; attempt < times; attempt += 1) {
    codes.push((await ask()).statusCode);
  }
  return codes;
}

/**
 * FIN-114 — every other route in this app costs a database query; these two
 * cost money. The limit is keyed on the address, which with no authentication
 * is a guard against a runaway client — a retry loop, a stuck component — and
 * not what would make the app safe to expose.
 */
describe('the routes that spend money', () => {
  const burstOf = (max: number): SpendRateLimits => ({
    burst: { max, windowMs: A_MINUTE },
    daily: OPEN,
  });

  it('stops a hot loop on the setup conversation with 429 and Retry-After', async () => {
    const app = serverWith(burstOf(2));

    const codes = await repeat(3, () => askSetup(app));
    const stopped = await askSetup(app);

    expect(codes.slice(0, 2)).not.toContain(429);
    expect(stopped.statusCode).toBe(429);
    expect(stopped.headers['retry-after']).toBe('60');
    expect(stopped.json<{ error: string }>().error).toBe(
      'Requisições demais ao assistente. Tente de novo em 1 minuto.',
    );
  });

  it('stops a hot loop on the assistant', async () => {
    const app = serverWith(burstOf(2));

    const codes = await repeat(3, () => askAssistant(app));

    expect(codes.slice(0, 2)).not.toContain(429);
    expect(codes[2]).toBe(429);
  });

  /**
   * The two windows catch different things: the daily one bounds the worst
   * case even when every short window is respected.
   */
  it('bounds the day even when the short window never fires', async () => {
    const app = serverWith({
      burst: { max: 1_000, windowMs: A_MINUTE },
      daily: { max: 1, windowMs: A_DAY },
    });

    await askSetup(app);
    const stopped = await askSetup(app);

    expect(stopped.statusCode).toBe(429);
    expect(stopped.headers['retry-after']).toBe('86400');
    expect(stopped.json<{ error: string }>().error).toBe(
      'Requisições demais ao assistente. Tente de novo em 1 dia.',
    );
  });

  /** One budget, because it is one cost: both routes bill the same account. */
  it('counts both routes against the same budget', async () => {
    const app = serverWith(burstOf(2));

    await askSetup(app);
    await askAssistant(app);
    const stopped = await askSetup(app);

    expect(stopped.statusCode).toBe(429);
  });
});

/**
 * `@fastify/rate-limit` humanises its own `after` through `@lukeed/ms`, which
 * speaks only English. The seconds it hands over alongside it are the same
 * number the `retry-after` header carries, so reading those instead keeps the
 * body in the language the screens are written in — CLAUDE.md rule 6.
 */
describe('the wait, said in Portuguese', () => {
  it.each([
    [1, '1 segundo'],
    [45, '45 segundos'],
    [60, '1 minuto'],
    [90, '2 minutos'],
    [3_600, '1 hora'],
    [5_400, '2 horas'],
    [86_400, '1 dia'],
    [172_800, '2 dias'],
  ])('reads %i seconds as "%s"', (seconds, expected) => {
    expect(describeWait(seconds)).toBe(expected);
  });

  /** A window all but elapsed still asks for a wait, never for none. */
  it('never counts down to nothing', () => {
    expect(describeWait(0)).toBe('1 segundo');
  });
});

describe('the routes that do not spend money', () => {
  const closed: SpendRateLimits = {
    burst: { max: 1, windowMs: A_MINUTE },
    daily: { max: 1, windowMs: A_DAY },
  };

  it('leaves a burst of reads alone', async () => {
    const app = serverWith(closed);

    const codes = await repeat(10, () =>
      app.inject({ method: 'GET', url: '/setup' }),
    );

    expect(codes).toEqual(Array.from({ length: 10 }, () => 200));
  });

  /** The structured correction costs nothing, which is the whole of FIN-122. */
  it('leaves the structured corrections alone', async () => {
    const app = serverWith(closed);

    const codes = await repeat(10, () =>
      app.inject({
        method: 'PATCH',
        url: '/setup/conversation/conv-1/records/rec-1',
        payload: { amount: 35_000 },
      }),
    );

    expect(codes).toEqual(Array.from({ length: 10 }, () => 404));
  });
});
