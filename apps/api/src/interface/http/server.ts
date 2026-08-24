import Fastify, { type FastifyInstance } from 'fastify';

import type { AssistantConversation } from '../../application/assistant/assistant-conversation.js';
import type { ApplyProposal } from '../../application/assistant/uc-8-apply-proposal.js';
import type { ConfigurePaydayAnchor } from '../../application/budgeting/uc-1-1-configure-payday-anchor.js';
import type { ManageAccounts } from '../../application/budgeting/uc-1-2-manage-accounts.js';
import type { ManageTemplates } from '../../application/budgeting/uc-2-manage-templates.js';
import type { ReadCycle } from '../../application/budgeting/uc-3-1-read-cycle.js';
import type { CloseCycle } from '../../application/budgeting/uc-3-8-close-cycle.js';
import type { LedgerActions } from '../../application/budgeting/uc-3-ledger-actions.js';
import type { ManageBuckets } from '../../application/goals/uc-6-manage-buckets.js';
import type { BuildDashboard } from '../../application/projection/uc-4-build-dashboard.js';
import type { ReadSetupState } from '../../application/projection/uc-1-5-read-setup-state.js';
import type { CompleteSetup } from '../../application/setup/compose-setup.js';
import type { CorrectSetupRecord } from '../../application/setup/uc-1-5-correct-record.js';
import type { ConverseSetup } from '../../application/setup/uc-1-5-converse-setup.js';
import type { ProjectWealth } from '../../application/projection/uc-7-project-wealth.js';
import type { ListCycles } from '../../application/budgeting/uc-3-3-list-cycles.js';
import type { Clock } from '../../domain/ports/clock.js';
import type { SpendRateLimits } from './rate-limit.js';
import { buildSpendGuard } from './rate-limit.js';
import { registerAccountRoutes } from './routes/accounts.js';
import { registerAssistantRoutes } from './routes/assistant.js';
import { registerBucketRoutes } from './routes/buckets.js';
import { registerCycleRoutes } from './routes/cycles.js';
import { registerHealthRoute } from './routes/health.js';
import { registerProjectionRoutes } from './routes/projection.js';
import { registerLedgerRoutes } from './routes/ledger.js';
import { registerTemplateRoutes } from './routes/templates.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerSetupRoutes } from './routes/setup.js';

interface Dependencies {
  clock: Clock;
  configureAnchor: ConfigurePaydayAnchor;
  manageAccounts: ManageAccounts;
  readCycle: ReadCycle;
  listCycles: ListCycles;
  manageTemplates: ManageTemplates;
  ledgerActions: LedgerActions;
  closeCycle: CloseCycle;
  manageBuckets: ManageBuckets;
  buildDashboard: BuildDashboard;
  projectWealth: ProjectWealth;
  readSetupState: ReadSetupState;
  converseSetup: ConverseSetup;
  correctSetupRecord: CorrectSetupRecord;
  completeSetup: CompleteSetup;
  converseAssistant: AssistantConversation;
  applyProposal: ApplyProposal;
  /** What one caller may spend — FIN-114. */
  spendLimits: SpendRateLimits;
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
  manageBuckets,
  buildDashboard,
  projectWealth,
  readSetupState,
  converseSetup,
  correctSetupRecord,
  completeSetup,
  converseAssistant,
  applyProposal,
  spendLimits,
}: Dependencies): FastifyInstance {
  const app = Fastify({ logger: false });

  registerHealthRoute(app, { clock, startedAt: clock.now() });
  registerSettingsRoutes(app, { configureAnchor });
  registerAccountRoutes(app, { manageAccounts });
  registerCycleRoutes(app, { readCycle, listCycles });
  registerTemplateRoutes(app, { manageTemplates });
  registerLedgerRoutes(app, { ledgerActions, closeCycle });
  registerBucketRoutes(app, { manageBuckets });
  registerProjectionRoutes(app, {
    buildDashboard,
    projectWealth,
    manageBuckets,
  });

  // The two routes that reach a model are registered together, behind the one
  // budget they share. Everything above costs a database query and is not
  // worth limiting; the structured corrections inside the setup routes cost
  // nothing at all and are left alone there.
  void app.register(async (scope) => {
    const spendGuard = await buildSpendGuard(scope, spendLimits);

    registerSetupRoutes(scope, {
      readSetupState,
      converseSetup,
      correctSetupRecord,
      completeSetup,
      spendGuard,
    });
    registerAssistantRoutes(scope, {
      converseAssistant,
      applyProposal,
      spendGuard,
    });
  });

  return app;
}
