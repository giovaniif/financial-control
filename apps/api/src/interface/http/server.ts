import Fastify, { type FastifyInstance } from 'fastify';

import type { ConfigurePaydayAnchor } from '../../application/budgeting/uc-1-1-configure-payday-anchor.js';
import type { Clock } from '../../domain/ports/clock.js';
import { registerHealthRoute } from './routes/health.js';
import { registerSettingsRoutes } from './routes/settings.js';

interface Dependencies {
  clock: Clock;
  configureAnchor: ConfigurePaydayAnchor;
}

export function buildServer({
  clock,
  configureAnchor,
}: Dependencies): FastifyInstance {
  const app = Fastify({ logger: false });

  registerHealthRoute(app, { clock, startedAt: clock.now() });
  registerSettingsRoutes(app, { configureAnchor });

  return app;
}
