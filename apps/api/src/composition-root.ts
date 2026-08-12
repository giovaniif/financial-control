import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';

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
import { ImportSpreadsheet } from './application/import/uc-1-7-import-spreadsheet.js';
import { ReadSetupState } from './application/projection/uc-1-5-read-setup-state.js';
import { ProjectWealth } from './application/projection/uc-7-project-wealth.js';
import { ListCycles } from './application/budgeting/uc-3-3-list-cycles.js';
import { SystemClock } from './infrastructure/clock/system-clock.js';
import { BrazilianHolidayCalendar } from './infrastructure/holidays/brazilian-holiday-calendar.js';
import { PrismaAccountRepository } from './infrastructure/prisma/prisma-account-repository.js';
import { PrismaBucketRepository } from './infrastructure/prisma/prisma-bucket-repository.js';
import { PrismaCardRepository } from './infrastructure/prisma/prisma-card-repository.js';
import { PrismaCycleRepository } from './infrastructure/prisma/prisma-cycle-repository.js';
import { PrismaTemplateRepository } from './infrastructure/prisma/prisma-template-repository.js';
import { PrismaSettingsRepository } from './infrastructure/prisma/prisma-settings-repository.js';
import { XlsxSpreadsheetReader } from './infrastructure/spreadsheet/xlsx-spreadsheet-reader.js';
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

  const settings = new PrismaSettingsRepository(prisma);
  const spreadsheets = new XlsxSpreadsheetReader();
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

  return buildServer({
    clock,
    configureAnchor: new ConfigurePaydayAnchor(
      settings,
      cycles,
      holidays,
      clock,
    ),
    manageAccounts: new ManageAccounts(accounts),
    readCycle: new ReadCycle(cycles, settings, holidays, templates),
    listCycles: new ListCycles(
      cycles,
      settings,
      accounts,
      holidays,
      clock,
      templates,
    ),
    manageTemplates: new ManageTemplates(
      templates,
      cycles,
      settings,
      holidays,
      clock,
    ),
    ledgerActions: new LedgerActions(cycles, settings, holidays),
    closeCycle: new CloseCycle(cycles, settings, accounts, holidays, clock),
    manageCards: new ManageCards(cards, cycles, settings, holidays),
    manageBuckets: new ManageBuckets(buckets, cycles, settings, holidays),
    backupRestore: backup,
    importSpreadsheet: new ImportSpreadsheet(
      spreadsheets,
      backup,
      holidays,
      clock,
    ),
    buildDashboard: new BuildDashboard(
      cycles,
      buckets,
      settings,
      holidays,
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
  });
}
