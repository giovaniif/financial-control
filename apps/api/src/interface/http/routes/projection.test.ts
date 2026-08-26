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
      settings,
      noHolidays,
      clock,
      new InMemoryBucketRepository(),
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
    expect(body.headline.cycleLabel).toBe('Outubro de 2026');
    expect(body.headline.incoming).toBe(1_800_000);
    expect(body.headline.free).toBe(1_039_000);
  });

  it('answers about the cycle named in the query instead', async () => {
    const body = (
      await serverWith({ cycles: [september()] }).inject({
        method: 'GET',
        url: '/dashboard?month=2026-09',
      })
    ).json<DashboardResponse>();

    expect(body.headline.cycleLabel).toBe('Setembro de 2026');
  });

  it('rejects a month it cannot read', async () => {
    const response = await serverWith({ cycles: [september()] }).inject({
      method: 'GET',
      url: '/dashboard?month=nonsense',
    });

    expect(response.statusCode).toBe(400);
  });

  it('carries the KPIs and the progress reading', async () => {
    const body = (
      await serverWith({ cycles: [september()] }).inject({
        method: 'GET',
        url: '/dashboard',
      })
    ).json<DashboardResponse>();

    expect(body.kpis).toHaveLength(3);
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

  /**
   * UC-3.6 — `null` and `0` are different answers and the DTO has to keep
   * them apart: the default cycle is the next one, which is projected.
   */
  it('sends no variance for a projected cycle', async () => {
    const body = (
      await serverWith({ cycles: [september()] }).inject({
        method: 'GET',
        url: '/dashboard',
      })
    ).json<DashboardResponse>();

    expect(body.headline.cycleMonth).toBe('2026-10');
    expect(body.variance).toBeNull();
  });

  it('sends the variance for a cycle that has one', async () => {
    const body = (
      await serverWith({ cycles: [september()] }).inject({
        method: 'GET',
        url: '/dashboard?month=2026-09',
      })
    ).json<DashboardResponse>();

    expect(body.variance).toBe(0);
  });

  it('answers for an empty app rather than failing', async () => {
    const response = await serverWith().inject({
      method: 'GET',
      url: '/dashboard',
    });

    expect(response.statusCode).toBe(200);
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

/**
 * UC-4.4 — the toggle is global, so the dashboard has to answer in both
 * readings from the same endpoint. Matches `GET /cycles/:month`, which has
 * taken `estimates` since it was written.
 */
describe('GET /dashboard with the estimates toggle', () => {
  const withEstimate = () =>
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
          id: 'contractor',
          description: 'Contractor Costs',
          kind: EntryKind.Fixed,
          dueDate: LocalDate.parse('2026-09-25'),
          planned: reais(-1_500),
          isEstimate: true,
        }),
      ],
    });

  const dashboard = async (query: string) =>
    (
      await serverWith({ cycles: [withEstimate()] }).inject({
        method: 'GET',
        url: `/dashboard${query}`,
      })
    ).json<DashboardResponse>();

  it('includes the estimates when nothing is asked for', async () => {
    const body = await dashboard('');

    expect(body.estimates).toBe('included');
    expect(body.headline.outgoing).toBe(150_000);
  });

  it('leaves them out when the confirmed reading is asked for', async () => {
    const body = await dashboard('?estimates=excluded');

    expect(body.estimates).toBe('excluded');
    expect(body.headline.outgoing).toBe(0);
    expect(body.headline.closing).toBe(1_800_000);
  });

  it('still carries the closing balance without estimates either way', async () => {
    const included = await dashboard('?estimates=included');
    const excluded = await dashboard('?estimates=excluded');

    expect(included.headline.closingWithoutEstimates).toBe(1_800_000);
    expect(excluded.headline.closingWithoutEstimates).toBe(1_800_000);
  });

  it('refuses a reading that is neither', async () => {
    const response = await serverWith({ cycles: [withEstimate()] }).inject({
      method: 'GET',
      url: '/dashboard?estimates=maybe',
    });

    expect(response.statusCode).toBe(400);
  });
});
