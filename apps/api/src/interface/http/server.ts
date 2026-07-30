import Fastify, { type FastifyInstance } from 'fastify';

import type { Clock } from '../../domain/ports/clock.js';
import { registerHealthRoute } from './routes/health.js';

interface Dependencies {
  clock: Clock;
}

export function buildServer({ clock }: Dependencies): FastifyInstance {
  const app = Fastify({ logger: false });

  registerHealthRoute(app, { clock, startedAt: clock.now() });

  return app;
}
