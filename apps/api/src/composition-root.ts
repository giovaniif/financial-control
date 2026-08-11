import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';

import { ConfigurePaydayAnchor } from './application/budgeting/uc-1-1-configure-payday-anchor.js';
import { SystemClock } from './infrastructure/clock/system-clock.js';
import { BrazilianHolidayCalendar } from './infrastructure/holidays/brazilian-holiday-calendar.js';
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

  return buildServer({
    clock,
    configureAnchor: new ConfigurePaydayAnchor(
      settings,
      cycles,
      holidays,
      clock,
    ),
  });
}
