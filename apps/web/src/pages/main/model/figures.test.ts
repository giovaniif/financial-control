import type { CycleResponse, DashboardResponse } from '@fin/contracts';
import { describe, expect, it } from 'vitest';

import { figuresFor } from './figures.js';

const dashboard = (): DashboardResponse => ({
  today: '2026-08-19',
  currentCycleMonth: '2026-08',
  estimates: 'included',
  headline: {
    cycleMonth: '2026-09',
    cycleLabel: 'September 2026',
    range: '4 Sep – 4 Oct',
    incoming: 1_800_000,
    outgoing: 911_000,
    free: 355_600,
    lowestPoint: 200_000,
    lowestPointDate: '2026-09-28',
    closing: 355_600,
    closingWithoutEstimates: 505_600,
  },
  kpis: [
    { label: 'Total Outcome', amount: 911_000, note: 'everything out' },
    { label: 'Expected Surplus', amount: 889_000, note: 'to allocate' },
    { label: 'Net Surplus', amount: 355_600, note: 'free cash' },
    {
      label: 'Lowest point in cycle',
      amount: 200_000,
      note: 'on 2026-09-28, after Contractor Costs',
    },
  ],
  progress: {
    dayOfCycle: 6,
    cycleLength: 30,
    timePercent: 20,
    spent: 100_000,
    plannedOut: 200_000,
    spentPercent: 50,
  },
  upcoming: [
    {
      id: 'e1',
      cycleMonth: '2026-09',
      description: 'Electricity',
      dueDate: '2026-09-15',
      amount: -28_000,
      isEstimate: false,
      isOverdue: false,
      daysLate: 0,
    },
    {
      id: 'e2',
      cycleMonth: '2026-09',
      description: 'Contractor Costs',
      dueDate: '2026-09-25',
      amount: -150_000,
      isEstimate: true,
      isOverdue: false,
      daysLate: 0,
    },
  ],
  alerts: [],
});

const confirmedCycle = (
  overrides: Partial<CycleResponse> = {},
): CycleResponse => ({
  id: '2026-09',
  month: '2026-09',
  label: 'September 2026',
  start: '2026-09-04',
  end: '2026-10-04',
  status: 'OPEN',
  estimates: 'excluded',
  chain: {
    openingBalance: 100_000,
    totalIncome: 1_800_000,
    totalOutcome: 761_000,
    variables: 0,
    surplus: 1_039_000,
    expectedSurplus: 1_039_000,
    allocations: 533_400,
    netSurplus: 505_600,
    closingBalance: 605_600,
  },
  entries: [],
  lowWaterMark: {
    balance: 350_000,
    date: '2026-09-15',
    description: 'Electricity',
  },
  firstNegativeDate: null,
  ...overrides,
});

describe('figuresFor', () => {
  it('answers with the dashboard as it stands while estimates are included', () => {
    const figures = figuresFor(dashboard(), confirmedCycle(), 'included');

    expect(figures.headline.outgoing).toBe(911_000);
    expect(figures.kpis[0]?.amount).toBe(911_000);
    expect(figures.upcoming).toHaveLength(2);
  });

  /**
   * The dashboard read model is always built including estimates, so the
   * confirmed-only reading is the same cycle the page already reads — the
   * server computes it, the browser never re-derives a total.
   */
  it('states the confirmed figures once the estimates are switched off', () => {
    const figures = figuresFor(dashboard(), confirmedCycle(), 'excluded');

    expect(figures.headline.outgoing).toBe(761_000);
    expect(figures.headline.free).toBe(505_600);
    expect(figures.headline.closing).toBe(605_600);
    expect(figures.headline.lowestPoint).toBe(350_000);
    expect(figures.headline.lowestPointDate).toBe('2026-09-15');
  });

  it('keeps the cycle it is describing while the figures change', () => {
    const figures = figuresFor(dashboard(), confirmedCycle(), 'excluded');

    expect(figures.headline.cycleLabel).toBe('September 2026');
    expect(figures.headline.range).toBe('4 Sep – 4 Oct');
  });

  it('restates every KPI from the confirmed chain', () => {
    const figures = figuresFor(dashboard(), confirmedCycle(), 'excluded');
    const amounts = Object.fromEntries(
      figures.kpis.map((kpi) => [kpi.label, kpi.amount]),
    );

    expect(amounts).toEqual({
      'Total Outcome': 761_000,
      'Expected Surplus': 1_039_000,
      'Net Surplus': 505_600,
      'Lowest point in cycle': 350_000,
    });
    expect(figures.kpis[3]?.note).toBe('on 2026-09-15, after Electricity');
  });

  it('says nothing is scheduled when the confirmed cycle has no lowest point', () => {
    const figures = figuresFor(
      dashboard(),
      confirmedCycle({ lowWaterMark: null }),
      'excluded',
    );

    expect(figures.headline.lowestPoint).toBeNull();
    expect(figures.kpis[3]?.note).toBe('nothing scheduled yet');
  });

  // An unconfirmed placeholder is not something to settle.
  it('drops the estimates from the upcoming list', () => {
    const figures = figuresFor(dashboard(), confirmedCycle(), 'excluded');

    expect(figures.upcoming.map((entry) => entry.description)).toEqual([
      'Electricity',
    ]);
  });

  it('closes at the same figure either way once nothing is a guess', () => {
    const figures = figuresFor(dashboard(), confirmedCycle(), 'excluded');

    expect(figures.headline.closingWithoutEstimates).toBe(
      figures.headline.closing,
    );
  });

  // A cycle read that has not caught up would state another cycle's figures.
  it('waits for the confirmed cycle rather than mixing two of them', () => {
    const stale = confirmedCycle({ month: '2026-08' });

    expect(figuresFor(dashboard(), stale, 'excluded').headline.outgoing).toBe(
      911_000,
    );
    expect(figuresFor(dashboard(), undefined, 'excluded').headline.free).toBe(
      355_600,
    );
  });
});
