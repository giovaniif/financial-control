import type { BucketResponse, DashboardResponse } from '@fin/contracts';
import { screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/shared/testing';

import { DashboardPage } from './dashboard-page.js';

const dashboard = (
  overrides: Partial<DashboardResponse> = {},
): DashboardResponse => ({
  today: '2026-08-10',
  currentCycleMonth: '2026-08',
  headline: {
    cycleMonth: '2026-09',
    cycleLabel: 'September 2026',
    range: '2026-09-04 – 2026-10-04',
    incoming: 1_800_000,
    outgoing: 911_000,
    free: 355_600,
    lowestPoint: 355_600,
    lowestPointDate: '2026-09-28',
    closing: 355_600,
    closingWithoutEstimates: 505_600,
    ...overrides.headline,
  },
  kpis: [
    { label: 'Total Outcome', amount: 911_000, note: 'everything out' },
    { label: 'Expected Surplus', amount: 889_000, note: 'to allocate' },
    { label: 'Net Surplus', amount: 355_600, note: 'free cash' },
    { label: 'Lowest point in cycle', amount: 355_600, note: 'on 28/09' },
  ],
  progress: {
    dayOfCycle: 6,
    cycleLength: 30,
    timePercent: 20,
    spent: 100_000,
    plannedOut: 200_000,
    spentPercent: 50,
  },
  upcoming: [],
  alerts: [],
  ...overrides,
});

/**
 * The pages fetch through the shared client, so the network is the seam — and
 * the stub answers per endpoint, because the shell fetches accounts alongside
 * whatever the page itself asks for.
 */
function respondWith(
  dashboardBody: DashboardResponse,
  buckets: BucketResponse[] = [],
) {
  // Requests are prefixed with the /api path the Vite proxy forwards.
  const routes: Record<string, unknown> = {
    '/api/dashboard': dashboardBody,
    '/api/accounts': { accounts: [], total: 0 },
    '/api/buckets': buckets,
    '/api/cycles': { estimates: 'included', cycles: [] },
  };

  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) => {
      const path = new URL(input, 'http://test').pathname;
      const body = routes[path] ?? {};

      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }),
  );
}

const renderPage = () =>
  renderWithProviders(
    <RouterProvider
      router={createMemoryRouter([{ path: '/', element: <DashboardPage /> }])}
    />,
  );

beforeEach(() => {
  respondWith(dashboard());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DashboardPage', () => {
  it('reads the answer as one sentence', async () => {
    renderPage();

    const headline = await screen.findByText(/stays free after allocations/);

    expect(headline).toHaveTextContent(
      'In the September 2026 cycle you’ll receive',
    );
  });

  it('states the amounts in the headline', async () => {
    renderPage();

    const headline = await screen.findByText(/stays free after allocations/);

    // The same figures also appear as KPI tiles, so this scopes to the sentence.
    expect(headline).toHaveTextContent('R$ 18.000,00');
    expect(headline).toHaveTextContent('R$ 9.110,00');
    expect(headline).toHaveTextContent('R$ 3.556,00');
  });

  // Never let a guess masquerade as a fact.
  it('shows the closing balance without the estimates too', async () => {
    renderPage();

    expect(
      await screen.findByText('Without the estimates'),
    ).toBeInTheDocument();
    expect(screen.getByText('R$ 5.056,00')).toBeInTheDocument();
  });

  it('shows the four KPIs in the order the chain runs', async () => {
    renderPage();

    await screen.findByText('Total Outcome');

    expect(
      screen.getAllByText(
        /^(Total Outcome|Expected Surplus|Net Surplus|Lowest point in cycle)$/,
      ),
    ).toHaveLength(4);
  });

  it('reports cycle progress against spend', async () => {
    renderPage();

    expect(await screen.findByText('Day 6 of 30')).toBeInTheDocument();
    expect(screen.getByText('Spent against planned')).toBeInTheDocument();
  });

  it('says when there is nothing due', async () => {
    renderPage();

    expect(await screen.findByText('Nothing due')).toBeInTheDocument();
  });

  it('announces a critical alert to a screen reader', async () => {
    respondWith(
      dashboard({
        alerts: [
          {
            severity: 'CRITICAL',
            title: 'Projected negative balance on 2026-09-28',
            body: 'September 2026 runs to -R$ 2.013,22.',
          },
        ],
      }),
    );

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Projected negative balance',
    );
  });

  it('lists an overdue entry with how late it is', async () => {
    respondWith(
      dashboard({
        upcoming: [
          {
            id: 'e1',
            cycleMonth: '2026-08',
            description: 'Renovation Progress',
            dueDate: '2026-08-06',
            amount: -235_000,
            isEstimate: false,
            isOverdue: true,
            daysLate: 4,
          },
        ],
      }),
    );

    renderPage();

    expect(await screen.findByText('Renovation Progress')).toBeInTheDocument();
    expect(screen.getByText('4 days late')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settle' })).toBeInTheDocument();
  });

  it('offers to confirm money coming in, not settle it', async () => {
    respondWith(
      dashboard({
        upcoming: [
          {
            id: 'e1',
            cycleMonth: '2026-09',
            description: 'Salary',
            dueDate: '2026-09-04',
            amount: 1_800_000,
            isEstimate: false,
            isOverdue: false,
            daysLate: 0,
          },
        ],
      }),
    );

    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Confirm' }),
    ).toBeInTheDocument();
  });

  it('tags an unconfirmed estimate wherever it appears', async () => {
    respondWith(
      dashboard({
        upcoming: [
          {
            id: 'e1',
            cycleMonth: '2026-09',
            description: 'Contractor Costs',
            dueDate: '2026-09-25',
            amount: -150_000,
            isEstimate: true,
            isOverdue: false,
            daysLate: 0,
          },
        ],
      }),
    );

    renderPage();

    expect(await screen.findByText('~estimate')).toBeInTheDocument();
  });

  // UC-4.1 — a cycle with nothing scheduled has no lowest point to name.
  it('says so when there is no lowest point', async () => {
    respondWith(
      dashboard({
        headline: {
          ...dashboard().headline,
          lowestPoint: null,
          lowestPointDate: null,
        },
      }),
    );

    renderPage();

    expect(await screen.findByText('nothing scheduled')).toBeInTheDocument();
  });

  it('shows no bucket chips before there are any buckets', async () => {
    renderPage();

    await screen.findByText('Total Outcome');

    expect(screen.queryByText('Buckets')).not.toBeInTheDocument();
  });

  it('shows a goal bucket as progress toward its target', async () => {
    respondWith(dashboard(), [goal(), archived()]);

    renderPage();

    expect(await screen.findByText('Apartment')).toBeInTheDocument();
    expect(screen.getByText(/24% of/)).toBeInTheDocument();
    // Archived buckets are out of the picture entirely.
    expect(screen.queryByText('Europe Trip')).not.toBeInTheDocument();
  });

  // Reporting progress toward a target that does not exist is the bug UC-6.1
  // exists to prevent.
  it('shows an ongoing bucket as having nothing to complete', async () => {
    respondWith(dashboard(), [ongoing()]);

    renderPage();

    expect(await screen.findByText('Investments')).toBeInTheDocument();
    expect(screen.getByText('ongoing — no target to hit')).toBeInTheDocument();
    expect(screen.queryByText(/% of/)).not.toBeInTheDocument();
  });
});

const bucket = (overrides: Partial<BucketResponse>): BucketResponse => ({
  id: 'b1',
  name: 'Apartment',
  purpose: '',
  mode: 'GOAL',
  status: 'ACTIVE',
  priority: 1,
  balance: 3_600_000,
  contributed: 3_600_000,
  yielded: 0,
  target: 15_000_000,
  targetDate: '2031-03-31',
  percentComplete: 24,
  rule: { kind: 'PERCENT', percent: 20 },
  expectedYieldPercent: null,
  events: [],
  ...overrides,
});

const goal = () => bucket({});

const ongoing = () =>
  bucket({
    id: 'b2',
    name: 'Investments',
    mode: 'ONGOING',
    target: null,
    targetDate: null,
    percentComplete: null,
  });

const archived = () =>
  bucket({ id: 'b3', name: 'Europe Trip', status: 'ARCHIVED' });
