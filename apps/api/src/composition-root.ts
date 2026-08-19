import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';

import { AssistantConversation } from './application/assistant/assistant-conversation.js';
import type { ProposedChange } from './application/assistant/proposed-change.js';
import { ApplyProposal } from './application/assistant/uc-8-apply-proposal.js';
import { AskAssistant } from './application/assistant/uc-8-ask-assistant.js';
import { BackupRestore } from './application/backup/uc-1-6-backup-restore.js';
import { ConfigurePaydayAnchor } from './application/budgeting/uc-1-1-configure-payday-anchor.js';
import { ManageAccounts } from './application/budgeting/uc-1-2-manage-accounts.js';
import { ManageTemplates } from './application/budgeting/uc-2-manage-templates.js';
import { ReadCycle } from './application/budgeting/uc-3-1-read-cycle.js';
import { CloseCycle } from './application/budgeting/uc-3-8-close-cycle.js';
import { LedgerActions } from './application/budgeting/uc-3-ledger-actions.js';
import { ManageCards } from './application/cards/uc-5-manage-cards.js';
import { ManageBuckets } from './application/goals/uc-6-manage-buckets.js';
import { BuildDashboard } from './application/projection/uc-4-build-dashboard.js';
import { ReadSetupState } from './application/projection/uc-1-5-read-setup-state.js';
import { CompleteSetup } from './application/setup/compose-setup.js';
import { CorrectSetupRecord } from './application/setup/uc-1-5-correct-record.js';
import type { SetupConversations } from './application/setup/uc-1-5-converse-setup.js';
import { ConverseSetup } from './application/setup/uc-1-5-converse-setup.js';
import { ProjectWealth } from './application/projection/uc-7-project-wealth.js';
import { ListCycles } from './application/budgeting/uc-3-3-list-cycles.js';
import { createLanguageModel } from './infrastructure/anthropic/create-language-model.js';
import {
  ASSISTANT_LIMITS,
  MODELS,
  SPEND_RATE_LIMITS,
} from './infrastructure/anthropic/models.js';
import { SystemClock } from './infrastructure/clock/system-clock.js';
import { UuidIdSource } from './infrastructure/ids/uuid-id-source.js';
import { BrazilianHolidayCalendar } from './infrastructure/holidays/brazilian-holiday-calendar.js';
import { PrismaAccountRepository } from './infrastructure/prisma/prisma-account-repository.js';
import { PrismaBucketRepository } from './infrastructure/prisma/prisma-bucket-repository.js';
import { PrismaCardRepository } from './infrastructure/prisma/prisma-card-repository.js';
import { PrismaCycleRepository } from './infrastructure/prisma/prisma-cycle-repository.js';
import { PrismaTemplateRepository } from './infrastructure/prisma/prisma-template-repository.js';
import { PrismaSettingsRepository } from './infrastructure/prisma/prisma-settings-repository.js';
import { InMemoryAssistantConversationStore } from './infrastructure/assistant/in-memory-assistant-conversation-store.js';
import { InMemoryProposalStore } from './infrastructure/assistant/in-memory-proposal-store.js';
import { InMemorySetupConversationStore } from './infrastructure/setup/in-memory-setup-conversation-store.js';
import { buildServer } from './interface/http/server.js';

/**
 * The one place where ports meet their implementations. Everything below this
 * file receives its dependencies through a constructor or a parameter, which is
 * what lets the layers be tested without a database, a network or a real clock.
 */
export function createApp(): FastifyInstance {
  const prisma = new PrismaClient();
  const clock = new SystemClock();
  const holidays = new BrazilianHolidayCalendar();

  // Extraction, not the assistant: the setup conversation turns a sentence
  // into one tool call against a strict schema, and latency is felt on every
  // turn of it. The only place the key is read.
  const model = createLanguageModel(process.env, MODELS.extraction);
  const conversations: SetupConversations =
    new InMemorySetupConversationStore();

  // The assistant, not extraction: it chains tool reads and then writes a
  // real answer, which is a different job from turning one sentence into one
  // tool call. The key is read in the same one place.
  const assistantModel = createLanguageModel(process.env, MODELS.assistant);
  const assistantConversations = new InMemoryAssistantConversationStore();
  const proposals = new InMemoryProposalStore<ProposedChange>();

  const settings = new PrismaSettingsRepository(prisma);
  const cycles = new PrismaCycleRepository(prisma);
  const accounts = new PrismaAccountRepository(prisma);
  const templates = new PrismaTemplateRepository(prisma);
  const cards = new PrismaCardRepository(prisma);
  const buckets = new PrismaBucketRepository(prisma);

  const backup = new BackupRestore(
    cycles,
    accounts,
    templates,
    cards,
    buckets,
    settings,
    holidays,
    clock,
  );

  // Named rather than inlined: the assistant reads through the very
  // interactors the screens are built from, so a figure it states and a
  // figure on screen cannot come from two different places (UC-8.2).
  const configureAnchor = new ConfigurePaydayAnchor(
    settings,
    cycles,
    holidays,
    clock,
  );
  const readCycle = new ReadCycle(cycles, settings, holidays, templates);
  const listCycles = new ListCycles(
    cycles,
    settings,
    accounts,
    holidays,
    clock,
    templates,
  );
  const manageTemplates = new ManageTemplates(
    templates,
    cycles,
    settings,
    holidays,
    clock,
  );
  const ledgerActions = new LedgerActions(cycles, settings, holidays);
  const manageCards = new ManageCards(cards, cycles, settings, holidays);
  const manageBuckets = new ManageBuckets(buckets, cycles, settings, holidays);
  const buildDashboard = new BuildDashboard(
    cycles,
    buckets,
    settings,
    holidays,
    clock,
  );
  const projectWealth = new ProjectWealth(buckets);

  return buildServer({
    clock,
    configureAnchor,
    manageAccounts: new ManageAccounts(accounts),
    readCycle,
    listCycles,
    manageTemplates,
    ledgerActions,
    closeCycle: new CloseCycle(cycles, settings, accounts, holidays, clock),
    manageCards,
    manageBuckets,
    backupRestore: backup,
    buildDashboard,
    projectWealth,
    readSetupState: new ReadSetupState(
      settings,
      accounts,
      templates,
      cards,
      buckets,
    ),
    converseSetup: new ConverseSetup(
      model,
      conversations,
      new UuidIdSource(),
      holidays,
      clock,
    ),
    correctSetupRecord: new CorrectSetupRecord(conversations),
    completeSetup: new CompleteSetup(conversations, backup, clock),
    converseAssistant: new AssistantConversation(
      new AskAssistant(
        assistantModel,
        {
          cycle: readCycle,
          dashboard: buildDashboard,
          cycles: listCycles,
          buckets: manageBuckets,
          wealth: projectWealth,
        },
        proposals,
        new UuidIdSource(),
        clock,
        ASSISTANT_LIMITS.maxToolRoundTrips,
      ),
      assistantConversations,
      new UuidIdSource(),
      ASSISTANT_LIMITS,
    ),
    applyProposal: new ApplyProposal(
      proposals,
      ledgerActions,
      manageTemplates,
      configureAnchor,
      manageCards,
      manageBuckets,
      clock,
    ),
    spendLimits: SPEND_RATE_LIMITS,
  });
}
