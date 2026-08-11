import type { FastifyInstance } from 'fastify';

import { ConfigurePaydayAnchor } from '../../../application/budgeting/uc-1-1-configure-payday-anchor.js';
import { ManageAccounts } from '../../../application/budgeting/uc-1-2-manage-accounts.js';
import { ReadCycle } from '../../../application/budgeting/uc-3-1-read-cycle.js';
import { ListCycles } from '../../../application/budgeting/uc-3-3-list-cycles.js';
import {
  InMemoryAccountRepository,
  InMemoryCycleRepository,
  InMemorySettingsRepository,
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

  return buildServer({
    clock,
    configureAnchor: new ConfigurePaydayAnchor(
      settings,
      cycles,
      noHolidays,
      clock,
    ),
    manageAccounts: new ManageAccounts(accounts),
    readCycle: new ReadCycle(cycles, settings, noHolidays),
    listCycles: new ListCycles(cycles, settings, accounts, noHolidays, clock),
    ...overrides,
  });
}
