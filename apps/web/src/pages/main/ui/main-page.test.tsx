import type {
  BucketResponse,
  CycleResponse,
  DashboardResponse,
} from '@fin/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/shared/testing';

import { MainPage } from './main-page.js';

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

const cycle = (month: string): CycleResponse => ({
  id: month,
  month,
  label: `${month} label`,
  start: `${month}-01`,
  end: `${month}-28`,
  status: 'OPEN',
  estimates: 'included',
  chain: {
    openingBalance: 100_000,
    totalIncome: 1_800_000,
    totalOutcome: 911_000,
    variables: 0,
    surplus: 889_000,
    expectedSurplus: 889_000,
    allocations: 533_400,
    netSurplus: 355_600,
    closingBalance: 455_600,
  },
  entries: [],
  lowWaterMark: null,
  firstNegativeDate: null,
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

const renderPage = (entry = '/') =>
  renderWithProviders(
    <RouterProvider
      router={createMemoryRouter([{ path: '/', element: <MainPage /> }], {
        initialEntries: [entry],
      })}
    />,
  );

const summary = (
  month: string,
  position: 'current' | 'next' | 'projected',
) => ({
  month,
  label: `${month} label`,
  start: `${month}-01`,
  end: `${month}-28`,
  status: 'OPEN' as const,
  position,
  openingBalance: 0,
  closingBalance: 0,
  netSurplus: 0,
  isMaterialised: true,
});

/**
 * Answers the dashboard per requested cycle, so what the screen renders is
 * evidence of which one it asked for.
 */
function respondPerCycle() {
  const byMonth: Record<string, DashboardResponse> = {
    '2026-08': dashboard({
      headline: { ...dashboard().headline, cycleLabel: 'August 2026' },
    }),
    '2026-09': dashboard({
      headline: { ...dashboard().headline, cycleLabel: 'September 2026' },
    }),
  };

  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) => {
      const url = new URL(input, 'http://test');
      const body =
        url.pathname === '/api/dashboard'
          ? (byMonth[url.searchParams.get('month') ?? ''] ??
            dashboard({
              headline: { ...dashboard().headline, cycleLabel: 'no month' },
            }))
          : url.pathname === '/api/cycles'
            ? {
                estimates: 'included',
                cycles: [
                  summary('2026-08', 'current'),
                  summary('2026-09', 'next'),
                ],
              }
            : url.pathname.startsWith('/api/cycles/')
              ? cycle(url.pathname.slice('/api/cycles/'.length))
              : url.pathname === '/api/accounts'
                ? { accounts: [], total: 0 }
                : url.pathname === '/api/buckets'
                  ? []
                  : {};

      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }),
  );
}

beforeEach(() => {
  respondWith(dashboard());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MainPage', () => {
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

  /**
   * UC-3.5 — with the Ledger screen gone this is the only place an entry is
   * settled by hand, so the two-click path has to live here as well as the
   * one-click one.
   */
  it('offers to settle at an amount other than the planned one', async () => {
    respondWith(
      dashboard({
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
        ],
      }),
    );

    renderPage();

    expect(
      await screen.findByRole('button', {
        name: 'Settle at a different amount',
      }),
    ).toBeInTheDocument();
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

// UC-3.3: cycle navigation is global, and this screen used to ignore it —
// the control was rendered in the header and did nothing at all.
describe('MainPage follows the selected cycle', () => {
  beforeEach(() => {
    respondPerCycle();
  });

  it('opens on the next cycle when none is selected', async () => {
    renderPage();

    expect(
      await screen.findByText(/In the September 2026 cycle/),
    ).toBeInTheDocument();
  });

  it('describes the cycle the nav has selected', async () => {
    renderPage('/?cycle=2026-08');

    expect(
      await screen.findByText(/In the August 2026 cycle/),
    ).toBeInTheDocument();
  });

  // UC-3.1 — the chain strip moved here when the Ledger screen went.
  it('carries the calculation chain for the cycle on screen', async () => {
    renderPage('/?cycle=2026-08');

    expect(
      await screen.findByText('available to allocate'),
    ).toBeInTheDocument();
    expect(screen.getByText("next cycle's opening")).toBeInTheDocument();
  });

  it('does not call a past cycle the next one', async () => {
    renderPage('/?cycle=2026-08');

    await screen.findByText(/In the August 2026 cycle/);

    expect(screen.queryByText('Next cycle')).not.toBeInTheDocument();
  });

  /**
   * Settling invalidates by the `['dashboard']` prefix, so the key the screen
   * actually reads under must sit beneath it. Putting the month in the key
   * without keeping that prefix is what silently stopped every settle from
   * refreshing the figures: the request went out, the cache never moved.
   */
  it('shows the new figures after settling, not the stale ones', async () => {
    const upcoming = {
      id: 'e1',
      cycleMonth: '2026-09',
      description: 'Renovation Progress',
      dueDate: '2026-09-24',
      amount: -235_000,
      isEstimate: false,
      isOverdue: false,
      daysLate: 0,
    };
    let settled = false;

    vi.stubGlobal(
      'fetch',
      vi.fn((input: string, init?: RequestInit) => {
        const url = new URL(input, 'http://test');

        if (init?.method === 'POST') {
          settled = true;
          return Promise.resolve(new Response(null, { status: 204 }));
        }

        const body =
          url.pathname === '/api/dashboard'
            ? dashboard({
                headline: {
                  ...dashboard().headline,
                  free: settled ? 1_000_000 : 355_600,
                },
                upcoming: settled ? [] : [upcoming],
              })
            : url.pathname === '/api/cycles'
              ? {
                  estimates: 'included',
                  cycles: [
                    summary('2026-08', 'current'),
                    summary('2026-09', 'next'),
                  ],
                }
              : url.pathname.startsWith('/api/cycles/')
                ? cycle(url.pathname.slice('/api/cycles/'.length))
                : url.pathname === '/api/accounts'
                  ? { accounts: [], total: 0 }
                  : url.pathname === '/api/buckets'
                    ? []
                    : {};

        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }),
    );

    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Settle' }),
    );

    // The freed-up figure is the visible proof the cache was invalidated and
    // refetched, not just that a request went out.
    expect(await screen.findByText('R$ 10.000,00')).toBeInTheDocument();
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
