import Fastify, { type FastifyInstance } from 'fastify';

import type { ConfigurePaydayAnchor } from '../../application/budgeting/uc-1-1-configure-payday-anchor.js';
import type { ManageAccounts } from '../../application/budgeting/uc-1-2-manage-accounts.js';
import type { Clock } from '../../domain/ports/clock.js';
import { registerAccountRoutes } from './routes/accounts.js';
import { registerHealthRoute } from './routes/health.js';
import { registerSettingsRoutes } from './routes/settings.js';

interface Dependencies {
  clock: Clock;
  configureAnchor: ConfigurePaydayAnchor;
  manageAccounts: ManageAccounts;
}

export function buildServer({
  clock,
  configureAnchor,
  manageAccounts,
}: Dependencies): FastifyInstance {
  const app = Fastify({ logger: false });

  registerHealthRoute(app, { clock, startedAt: clock.now() });
  registerSettingsRoutes(app, { configureAnchor });
  registerAccountRoutes(app, { manageAccounts });

  return app;
}
