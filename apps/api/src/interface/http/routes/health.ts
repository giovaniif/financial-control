import type { HealthResponse } from '@fin/contracts';
import type { FastifyInstance } from 'fastify';

import type { Clock } from '../../../domain/ports/clock.js';

interface Dependencies {
  clock: Clock;
  startedAt: Date;
}

export function registerHealthRoute(
  app: FastifyInstance,
  { clock, startedAt }: Dependencies,
): void {
  app.get('/health', (): HealthResponse => {
    const elapsedMs = clock.now().getTime() - startedAt.getTime();
    return { status: 'ok', uptimeSeconds: Math.floor(elapsedMs / 1000) };
  });
}
