import Fastify, { type FastifyInstance } from 'fastify';

import type { ConfigurePaydayAnchor } from '../../application/budgeting/uc-1-1-configure-payday-anchor.js';
import type { ManageAccounts } from '../../application/budgeting/uc-1-2-manage-accounts.js';
import type { ManageTemplates } from '../../application/budgeting/uc-2-manage-templates.js';
import type { ReadCycle } from '../../application/budgeting/uc-3-1-read-cycle.js';
import type { ListCycles } from '../../application/budgeting/uc-3-3-list-cycles.js';
import type { Clock } from '../../domain/ports/clock.js';
import { registerAccountRoutes } from './routes/accounts.js';
import { registerCycleRoutes } from './routes/cycles.js';
import { registerHealthRoute } from './routes/health.js';
import { registerTemplateRoutes } from './routes/templates.js';
import { registerSettingsRoutes } from './routes/settings.js';

interface Dependencies {
  clock: Clock;
  configureAnchor: ConfigurePaydayAnchor;
  manageAccounts: ManageAccounts;
  readCycle: ReadCycle;
  listCycles: ListCycles;
  manageTemplates: ManageTemplates;
}

export function buildServer({
  clock,
  configureAnchor,
  manageAccounts,
  readCycle,
  listCycles,
  manageTemplates,
}: Dependencies): FastifyInstance {
  const app = Fastify({ logger: false });

  registerHealthRoute(app, { clock, startedAt: clock.now() });
  registerSettingsRoutes(app, { configureAnchor });
  registerAccountRoutes(app, { manageAccounts });
  registerCycleRoutes(app, { readCycle, listCycles });
  registerTemplateRoutes(app, { manageTemplates });

  return app;
}
