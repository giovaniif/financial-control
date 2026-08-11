import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';

import { ConfigurePaydayAnchor } from './application/budgeting/uc-1-1-configure-payday-anchor.js';
import { ManageAccounts } from './application/budgeting/uc-1-2-manage-accounts.js';
import { ReadCycle } from './application/budgeting/uc-3-1-read-cycle.js';
import { ListCycles } from './application/budgeting/uc-3-3-list-cycles.js';
import { SystemClock } from './infrastructure/clock/system-clock.js';
import { BrazilianHolidayCalendar } from './infrastructure/holidays/brazilian-holiday-calendar.js';
import { PrismaAccountRepository } from './infrastructure/prisma/prisma-account-repository.js';
import { PrismaCycleRepository } from './infrastructure/prisma/prisma-cycle-repository.js';
import { PrismaSettingsRepository } from './infrastructure/prisma/prisma-settings-repository.js';
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
  const cycles = new PrismaCycleRepository(prisma);
  const accounts = new PrismaAccountRepository(prisma);

  return buildServer({
    clock,
    configureAnchor: new ConfigurePaydayAnchor(
      settings,
      cycles,
      holidays,
      clock,
    ),
    manageAccounts: new ManageAccounts(accounts),
    readCycle: new ReadCycle(cycles, settings, holidays),
    listCycles: new ListCycles(cycles, settings, accounts, holidays, clock),
  });
}
