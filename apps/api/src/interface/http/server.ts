import Fastify, { type FastifyInstance } from 'fastify';

import type { ConfigurePaydayAnchor } from '../../application/budgeting/uc-1-1-configure-payday-anchor.js';
import type { ManageAccounts } from '../../application/budgeting/uc-1-2-manage-accounts.js';
import type { ManageTemplates } from '../../application/budgeting/uc-2-manage-templates.js';
import type { ReadCycle } from '../../application/budgeting/uc-3-1-read-cycle.js';
import type { CloseCycle } from '../../application/budgeting/uc-3-8-close-cycle.js';
import type { LedgerActions } from '../../application/budgeting/uc-3-ledger-actions.js';
import type { ManageCards } from '../../application/cards/uc-5-manage-cards.js';
import type { ListCycles } from '../../application/budgeting/uc-3-3-list-cycles.js';
import type { Clock } from '../../domain/ports/clock.js';
import { registerAccountRoutes } from './routes/accounts.js';
import { registerCardRoutes } from './routes/cards.js';
import { registerCycleRoutes } from './routes/cycles.js';
import { registerHealthRoute } from './routes/health.js';
import { registerLedgerRoutes } from './routes/ledger.js';
import { registerTemplateRoutes } from './routes/templates.js';
import { registerSettingsRoutes } from './routes/settings.js';

interface Dependencies {
  clock: Clock;
  configureAnchor: ConfigurePaydayAnchor;
  manageAccounts: ManageAccounts;
  readCycle: ReadCycle;
  listCycles: ListCycles;
  manageTemplates: ManageTemplates;
  ledgerActions: LedgerActions;
  closeCycle: CloseCycle;
  manageCards: ManageCards;
}

export function buildServer({
  clock,
  configureAnchor,
  manageAccounts,
  readCycle,
  listCycles,
  manageTemplates,
  ledgerActions,
  closeCycle,
  manageCards,
}: Dependencies): FastifyInstance {
  const app = Fastify({ logger: false });

  registerHealthRoute(app, { clock, startedAt: clock.now() });
  registerSettingsRoutes(app, { configureAnchor });
  registerAccountRoutes(app, { manageAccounts });
  registerCycleRoutes(app, { readCycle, listCycles });
  registerTemplateRoutes(app, { manageTemplates });
  registerLedgerRoutes(app, { ledgerActions, closeCycle });
  registerCardRoutes(app, { manageCards });

  return app;
}
