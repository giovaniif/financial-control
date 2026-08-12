import type {
  DashboardResponse,
  WealthProjectionResponse,
} from '@fin/contracts';
import { describe, expect, it } from 'vitest';

import { ManageBuckets } from '../../../application/goals/uc-6-manage-buckets.js';
import { BuildDashboard } from '../../../application/projection/uc-4-build-dashboard.js';
import { ProjectWealth } from '../../../application/projection/uc-7-project-wealth.js';
import {
  InMemoryBucketRepository,
  InMemoryCycleRepository,
  InMemorySettingsRepository,
} from '../../../application/testing/fakes.js';
import { FixedClock } from '../../../application/testing/fixed-clock.js';
import {
  CycleRef,
  PaydayAnchor,
  ShiftPolicy,
} from '../../../domain/budgeting/cycle-ref.js';
import { Cycle } from '../../../domain/budgeting/cycle.js';
import {
  EntryKind,
  LedgerEntry,
} from '../../../domain/budgeting/ledger-entry.js';
import { Allocation, Bucket } from '../../../domain/goals/bucket.js';
import { noHolidays } from '../../../domain/ports/holiday-calendar.js';
import { LocalDate } from '../../../domain/shared/local-date.js';
import { Money } from '../../../domain/shared/money.js';
import { Percentage } from '../../../domain/shared/percentage.js';
import { buildTestServer } from '../testing/test-server.js';

const anchor = PaydayAnchor.of(5, ShiftPolicy.Preceding);
const clock = FixedClock.at('2026-08-10T12:00:00Z');
const reais = (amount: number) => Money.fromCents(Math.round(amount * 100));

const september = () =>
  Cycle.open({
    id: '2026-10',
    ref: CycleRef.forMonth('2026-10', anchor, noHolidays),
    openingBalance: Money.zero(),
    entries: [
      LedgerEntry.create({
        id: 'salary',
        description: 'Salary',
        kind: EntryKind.Income,
        dueDate: LocalDate.parse('2026-09-04'),
        planned: reais(18_000),
      }),
      LedgerEntry.create({
        id: 'rent',
        description: 'Rent',
        kind: EntryKind.Fixed,
        dueDate: LocalDate.parse('2026-09-10'),
        planned: reais(-7_610),
      }),
    ],
  });

const retirement = () =>
  Bucket.ongoing({
    id: 'retirement',
    name: 'Retirement',
    rule: Allocation.percentOfExpectedSurplus(Percentage.ofPercent(10)),
    priority: 1,
    expectedYield: Percentage.ofPercent(8),
  }).correctBalance(
    'e0',
    LocalDate.parse('2026-08-01'),
    reais(10_000),
    'opening',
  );

const serverWith = (options: { cycles?: Cycle[]; buckets?: Bucket[] } = {}) => {
  const cycles = new InMemoryCycleRepository(options.cycles ?? []);
  const buckets = new InMemoryBucketRepository(options.buckets ?? []);
  const settings = new InMemorySettingsRepository(anchor);

  return buildTestServer({
    clock,
    buildDashboard: new BuildDashboard(
      cycles,
      buckets,
      settings,
      noHolidays,
      clock,
    ),
    projectWealth: new ProjectWealth(buckets),
    manageBuckets: new ManageBuckets(buckets, cycles, settings, noHolidays),
  });
};

describe('GET /dashboard', () => {
  it('answers the headline about the next cycle', async () => {
    const response = await serverWith({ cycles: [september()] }).inject({
      method: 'GET',
      url: '/dashboard',
    });
    const body = response.json<DashboardResponse>();

    expect(response.statusCode).toBe(200);
    expect(body.currentCycleMonth).toBe('2026-09');
    expect(body.headline.cycleLabel).toBe('October 2026');
    expect(body.headline.incoming).toBe(1_800_000);
    expect(body.headline.free).toBe(1_039_000);
  });

  it('carries the four KPIs and the progress reading', async () => {
    const body = (
      await serverWith({ cycles: [september()] }).inject({
        method: 'GET',
        url: '/dashboard',
      })
    ).json<DashboardResponse>();

    expect(body.kpis).toHaveLength(4);
    expect(body.progress.cycleLength).toBeGreaterThan(0);
  });

  it('lists what is unsettled', async () => {
    const body = (
      await serverWith({ cycles: [september()] }).inject({
        method: 'GET',
        url: '/dashboard',
      })
    ).json<DashboardResponse>();

    expect(body.upcoming.map((u) => u.description)).toEqual(['Salary', 'Rent']);
  });

  it('answers for an empty app rather than failing', async () => {
    const response = await serverWith().inject({
      method: 'GET',
      url: '/dashboard',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<DashboardResponse>().alerts).toEqual([]);
  });
});

describe('GET /wealth', () => {
  it('projects five, ten, twenty and thirty years', async () => {
    const response = await serverWith({ buckets: [retirement()] }).inject({
      method: 'GET',
      url: '/wealth',
    });
    const body = response.json<WealthProjectionResponse>();

    expect(response.statusCode).toBe(200);
    expect(body.horizons.map((h) => h.years)).toEqual([5, 10, 20, 30]);
  });

  it('measures retirement in sustainable monthly income', async () => {
    const body = (
      await serverWith({ buckets: [retirement()] }).inject({
        method: 'GET',
        url: '/wealth',
      })
    ).json<WealthProjectionResponse>();

    expect(body.retirement?.name).toBe('Retirement');
    expect(body.retirement?.sustainableMonthlyIncome).toBeGreaterThan(0);
  });

  // The two screens must agree: the projection compounds whatever the rules
  // would actually allocate.
  it('takes its contributions from the allocation rules for a cycle', async () => {
    const body = (
      await serverWith({
        buckets: [retirement()],
        cycles: [september()],
      }).inject({ method: 'GET', url: '/wealth?month=2026-10' })
    ).json<WealthProjectionResponse>();

    // 10 % of the October Expected Surplus of R$ 10.390.
    expect(body.buckets[0]?.contributionPerCycle).toBe(103_900);
  });

  it('lets an assumption be tested without storing it', async () => {
    const base = (
      await serverWith({ buckets: [retirement()] }).inject({
        method: 'GET',
        url: '/wealth',
      })
    ).json<WealthProjectionResponse>();
    const optimistic = (
      await serverWith({ buckets: [retirement()] }).inject({
        method: 'GET',
        url: '/wealth?yields=retirement:12',
      })
    ).json<WealthProjectionResponse>();

    expect(optimistic.horizons[3]?.total).toBeGreaterThan(
      base.horizons[3]?.total ?? 0,
    );
    expect(optimistic.buckets[0]?.expectedYieldPercent).toBe(12);
  });

  it('answers for an app with no buckets', async () => {
    const body = (
      await serverWith().inject({ method: 'GET', url: '/wealth' })
    ).json<WealthProjectionResponse>();

    expect(body.buckets).toEqual([]);
    expect(body.retirement).toBeNull();
  });
});
