import Fastify, { type FastifyInstance } from 'fastify';

import type { AssistantConversation } from '../../application/assistant/assistant-conversation.js';
import type { ApplyProposal } from '../../application/assistant/uc-8-apply-proposal.js';
import type { BackupRestore } from '../../application/backup/uc-1-6-backup-restore.js';
import type { ConfigurePaydayAnchor } from '../../application/budgeting/uc-1-1-configure-payday-anchor.js';
import type { ManageAccounts } from '../../application/budgeting/uc-1-2-manage-accounts.js';
import type { ManageTemplates } from '../../application/budgeting/uc-2-manage-templates.js';
import type { ReadCycle } from '../../application/budgeting/uc-3-1-read-cycle.js';
import type { CloseCycle } from '../../application/budgeting/uc-3-8-close-cycle.js';
import type { LedgerActions } from '../../application/budgeting/uc-3-ledger-actions.js';
import type { ManageCards } from '../../application/cards/uc-5-manage-cards.js';
import type { ManageBuckets } from '../../application/goals/uc-6-manage-buckets.js';
import type { BuildDashboard } from '../../application/projection/uc-4-build-dashboard.js';
import type { ReadSetupState } from '../../application/projection/uc-1-5-read-setup-state.js';
import type { CompleteSetup } from '../../application/setup/compose-setup.js';
import type { ConverseSetup } from '../../application/setup/uc-1-5-converse-setup.js';
import type { ProjectWealth } from '../../application/projection/uc-7-project-wealth.js';
import type { ListCycles } from '../../application/budgeting/uc-3-3-list-cycles.js';
import type { Clock } from '../../domain/ports/clock.js';
import { registerAccountRoutes } from './routes/accounts.js';
import { registerAssistantRoutes } from './routes/assistant.js';
import { registerBackupRoutes } from './routes/backup.js';
import { registerBucketRoutes } from './routes/buckets.js';
import { registerCardRoutes } from './routes/cards.js';
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
  manageCards: ManageCards;
  manageBuckets: ManageBuckets;
  buildDashboard: BuildDashboard;
  projectWealth: ProjectWealth;
  backupRestore: BackupRestore;
  readSetupState: ReadSetupState;
  converseSetup: ConverseSetup;
  completeSetup: CompleteSetup;
  converseAssistant: AssistantConversation;
  applyProposal: ApplyProposal;
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
  manageBuckets,
  buildDashboard,
  projectWealth,
  backupRestore,
  readSetupState,
  converseSetup,
  completeSetup,
  converseAssistant,
  applyProposal,
}: Dependencies): FastifyInstance {
  const app = Fastify({ logger: false });

  registerHealthRoute(app, { clock, startedAt: clock.now() });
  registerSettingsRoutes(app, { configureAnchor });
  registerSetupRoutes(app, { readSetupState, converseSetup, completeSetup });
  registerAccountRoutes(app, { manageAccounts });
  registerCycleRoutes(app, { readCycle, listCycles });
  registerTemplateRoutes(app, { manageTemplates });
  registerLedgerRoutes(app, { ledgerActions, closeCycle });
  registerCardRoutes(app, { manageCards });
  registerBucketRoutes(app, { manageBuckets });
  registerProjectionRoutes(app, {
    buildDashboard,
    projectWealth,
    manageBuckets,
  });
  registerBackupRoutes(app, { backupRestore });
  registerAssistantRoutes(app, { converseAssistant, applyProposal });

  return app;
}
