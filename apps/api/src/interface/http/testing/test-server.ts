import type { FastifyInstance } from 'fastify';

import { BackupRestore } from '../../../application/backup/uc-1-6-backup-restore.js';
import { ConfigurePaydayAnchor } from '../../../application/budgeting/uc-1-1-configure-payday-anchor.js';
import { ManageAccounts } from '../../../application/budgeting/uc-1-2-manage-accounts.js';
import { ManageTemplates } from '../../../application/budgeting/uc-2-manage-templates.js';
import { ReadCycle } from '../../../application/budgeting/uc-3-1-read-cycle.js';
import { CloseCycle } from '../../../application/budgeting/uc-3-8-close-cycle.js';
import { LedgerActions } from '../../../application/budgeting/uc-3-ledger-actions.js';
import { ManageCards } from '../../../application/cards/uc-5-manage-cards.js';
import { ManageBuckets } from '../../../application/goals/uc-6-manage-buckets.js';
import { BuildDashboard } from '../../../application/projection/uc-4-build-dashboard.js';
import { ReadSetupState } from '../../../application/projection/uc-1-5-read-setup-state.js';
import { CompleteSetup } from '../../../application/setup/compose-setup.js';
import type { SetupConversations } from '../../../application/setup/uc-1-5-converse-setup.js';
import { ConverseSetup } from '../../../application/setup/uc-1-5-converse-setup.js';
import { FakeLanguageModel } from '../../../application/testing/fake-language-model.js';
import { ProjectWealth } from '../../../application/projection/uc-7-project-wealth.js';
import { ListCycles } from '../../../application/budgeting/uc-3-3-list-cycles.js';
import {
  FakeSetupConversationStore,
  InMemoryAccountRepository,
  InMemoryBucketRepository,
  InMemoryCardRepository,
  InMemoryCycleRepository,
  InMemorySettingsRepository,
  InMemoryTemplateRepository,
  SequentialIdSource,
} from '../../../application/testing/fakes.js';
import { FixedClock } from '../../../application/testing/fixed-clock.js';
import { noHolidays } from '../../../domain/ports/holiday-calendar.js';
import { buildServer } from '../server.js';

type Dependencies = Parameters<typeof buildServer>[0];

/**
 * A server wired to in-memory doubles, so a route test states only the
 * dependency it actually cares about. Without this, every new route makes
 * every existing route test fail to compile.
 */
export function buildTestServer(
  overrides: Partial<Dependencies> = {},
): FastifyInstance {
  const clock = FixedClock.at('2026-08-10T12:00:00Z');
  const settings = new InMemorySettingsRepository();
  const cycles = new InMemoryCycleRepository();
  const accounts = new InMemoryAccountRepository();
  const templates = new InMemoryTemplateRepository();
  const cards = new InMemoryCardRepository();
  const buckets = new InMemoryBucketRepository();

  const backup = new BackupRestore(
    cycles,
    accounts,
    templates,
    cards,
    buckets,
    settings,
    noHolidays,
    clock,
  );

  const conversations: SetupConversations = new FakeSetupConversationStore();

  return buildServer({
    clock,
    configureAnchor: new ConfigurePaydayAnchor(
      settings,
      cycles,
      noHolidays,
      clock,
    ),
    manageAccounts: new ManageAccounts(accounts),
    readCycle: new ReadCycle(cycles, settings, noHolidays, templates),
    listCycles: new ListCycles(
      cycles,
      settings,
      accounts,
      noHolidays,
      clock,
      templates,
    ),
    manageTemplates: new ManageTemplates(
      templates,
      cycles,
      settings,
      noHolidays,
      clock,
    ),
    ledgerActions: new LedgerActions(cycles, settings, noHolidays),
    closeCycle: new CloseCycle(cycles, settings, accounts, noHolidays, clock),
    manageCards: new ManageCards(cards, cycles, settings, noHolidays),
    manageBuckets: new ManageBuckets(buckets, cycles, settings, noHolidays),
    backupRestore: backup,
    buildDashboard: new BuildDashboard(
      cycles,
      buckets,
      settings,
      noHolidays,
      clock,
    ),
    projectWealth: new ProjectWealth(buckets),
    readSetupState: new ReadSetupState(
      settings,
      accounts,
      templates,
      cards,
      buckets,
    ),
    // An empty script: a route test that means to hold a conversation passes
    // its own model, and one that does not gets a double that says so loudly
    // rather than a turn nobody wrote.
    converseSetup: new ConverseSetup(
      new FakeLanguageModel([]),
      conversations,
      new SequentialIdSource('conv'),
      noHolidays,
      clock,
    ),
    completeSetup: new CompleteSetup(conversations, backup, clock),
    ...overrides,
  });
}
