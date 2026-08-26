import type { FastifyInstance } from 'fastify';

import type { AssistantLimits } from '../../../application/assistant/assistant-conversation.js';
import { AssistantConversation } from '../../../application/assistant/assistant-conversation.js';
import type { ProposedChange } from '../../../application/assistant/proposed-change.js';
import { ApplyProposal } from '../../../application/assistant/uc-8-apply-proposal.js';
import { AskAssistant } from '../../../application/assistant/uc-8-ask-assistant.js';
import { WriteSetupDocument } from '../../../application/setup/write-setup-document.js';
import { ConfigurePaydayAnchor } from '../../../application/budgeting/uc-1-1-configure-payday-anchor.js';
import { ManageAccounts } from '../../../application/budgeting/uc-1-2-manage-accounts.js';
import { ManageTemplates } from '../../../application/budgeting/uc-2-manage-templates.js';
import { ReadCycle } from '../../../application/budgeting/uc-3-1-read-cycle.js';
import { CloseCycle } from '../../../application/budgeting/uc-3-8-close-cycle.js';
import { LedgerActions } from '../../../application/budgeting/uc-3-ledger-actions.js';
import { ManageBuckets } from '../../../application/goals/uc-6-manage-buckets.js';
import { BuildDashboard } from '../../../application/projection/uc-4-build-dashboard.js';
import { ReadSetupState } from '../../../application/projection/uc-1-5-read-setup-state.js';
import { CompleteSetup } from '../../../application/setup/compose-setup.js';
import { CorrectSetupRecord } from '../../../application/setup/uc-1-5-correct-record.js';
import type {
  SetupConversations,
  SetupLimits,
} from '../../../application/setup/uc-1-5-converse-setup.js';
import { ConverseSetup } from '../../../application/setup/uc-1-5-converse-setup.js';
import { FakeLanguageModel } from '../../../application/testing/fake-language-model.js';
import { ProjectWealth } from '../../../application/projection/uc-7-project-wealth.js';
import { ListCycles } from '../../../application/budgeting/uc-3-3-list-cycles.js';
import { SpendCeiling } from '../../../application/spend/spend-ceiling.js';
import {
  FakeAssistantConversationStore,
  FakeProposalStore,
  FakeSetupConversationStore,
  FakeSpendLedger,
  InMemoryAccountRepository,
  InMemoryBucketRepository,
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
  const buckets = new InMemoryBucketRepository();

  const writeSetup = new WriteSetupDocument(
    cycles,
    accounts,
    templates,
    buckets,
    settings,
    noHolidays,
  );

  const conversations: SetupConversations = new FakeSetupConversationStore();
  const proposals = new FakeProposalStore<ProposedChange>();
  const manageAccounts = new ManageAccounts(accounts);
  const manageTemplates = new ManageTemplates(
    templates,
    cycles,
    settings,
    noHolidays,
    clock,
  );
  const manageBuckets = new ManageBuckets(
    buckets,
    cycles,
    settings,
    noHolidays,
  );
  const ledgerActions = new LedgerActions(cycles, settings, noHolidays);
  const configureAnchor = new ConfigurePaydayAnchor(
    settings,
    cycles,
    noHolidays,
    clock,
  );
  const readCycle = new ReadCycle(
    cycles,
    settings,
    noHolidays,
    templates,
    new InMemoryBucketRepository(),
  );
  const listCycles = new ListCycles(
    cycles,
    settings,
    accounts,
    noHolidays,
    clock,
    templates,
    new InMemoryBucketRepository(),
  );
  const buildDashboard = new BuildDashboard(
    cycles,
    settings,
    noHolidays,
    clock,
    new InMemoryBucketRepository(),
  );
  const projectWealth = new ProjectWealth(buckets);

  // Far above anything a route test spends, so the ceiling only ever refuses
  // in the test that is about it — which passes its own.
  const spend = new SpendCeiling(new FakeSpendLedger(), clock, 1_000_000);

  // A route test that means to hold a conversation passes its own assistant;
  // these numbers are this double's, not the app's tuning.
  const limits: AssistantLimits = {
    maxQuestionCharacters: 2_000,
    maxTurnsPerConversation: 20,
    maxToolRoundTrips: 5,
  };

  // Wide enough that no route test trips them by accident; a test about the
  // caps passes its own. These numbers are this double's, not the app's
  // tuning — see SETUP_LIMITS for those.
  const setupLimits: SetupLimits = {
    maxMessageCharacters: 10_000,
    maxTurnsPerConversation: 1_000,
  };

  return buildServer({
    clock,
    configureAnchor,
    manageAccounts,
    readCycle,
    listCycles,
    manageTemplates,
    ledgerActions,
    closeCycle: new CloseCycle(cycles, settings, accounts, noHolidays, clock),
    manageBuckets,
    buildDashboard,
    projectWealth,
    readSetupState: new ReadSetupState(settings, accounts, templates, buckets),
    // An empty script: a route test that means to hold a conversation passes
    // its own model, and one that does not gets a double that says so loudly
    // rather than a turn nobody wrote.
    converseSetup: new ConverseSetup(
      new FakeLanguageModel([]),
      conversations,
      spend,
      new SequentialIdSource('conv'),
      noHolidays,
      clock,
      setupLimits,
    ),
    correctSetupRecord: new CorrectSetupRecord(conversations),
    completeSetup: new CompleteSetup(conversations, writeSetup, clock),
    converseAssistant: new AssistantConversation(
      new AskAssistant(
        new FakeLanguageModel([]),
        {
          cycle: readCycle,
          dashboard: buildDashboard,
          cycles: listCycles,
          buckets: manageBuckets,
          wealth: projectWealth,
        },
        proposals,
        spend,
        new SequentialIdSource('proposal'),
        clock,
        limits.maxToolRoundTrips,
      ),
      new FakeAssistantConversationStore(),
      new SequentialIdSource('assistant-conv'),
      limits,
    ),
    applyProposal: new ApplyProposal(
      proposals,
      ledgerActions,
      manageTemplates,
      configureAnchor,
      manageBuckets,
      clock,
    ),
    // Wide enough that no route test trips it by accident; a test about the
    // limit itself passes its own. These numbers are this double's, not the
    // app's tuning — see SPEND_RATE_LIMITS for those.
    spendLimits: {
      burst: { max: 1_000, windowMs: 60_000 },
      daily: { max: 1_000, windowMs: 24 * 60 * 60 * 1_000 },
    },
    ...overrides,
  });
}
