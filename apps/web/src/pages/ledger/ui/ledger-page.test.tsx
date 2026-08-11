import type { CycleResponse } from '@fin/contracts';
import { screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, stubApi } from '@/shared/testing';

import { LedgerPage } from './ledger-page.js';

const window = {
  estimates: 'included',
  cycles: [
    {
      month: '2026-08',
      label: 'August 2026',
      start: '2026-08-05',
      end: '2026-09-03',
      status: 'OPEN',
      position: 'current',
      openingBalance: 0,
      closingBalance: 0,
      netSurplus: 0,
      isMaterialised: true,
    },
  ],
};

const cycle = (overrides: Partial<CycleResponse> = {}): CycleResponse => ({
  id: '2026-08',
  month: '2026-08',
  label: 'August 2026',
  start: '2026-08-05',
  end: '2026-09-03',
  status: 'OPEN',
  estimates: 'included',
  chain: {
    openingBalance: 0,
    totalIncome: 1_800_000,
    totalOutcome: 761_000,
    variables: 0,
    surplus: 1_039_000,
    expectedSurplus: 1_039_000,
    allocations: 0,
    netSurplus: 1_039_000,
    closingBalance: 1_039_000,
  },
  entries: [],
  lowWaterMark: null,
  firstNegativeDate: null,
  ...overrides,
});

const entry = (overrides: Partial<CycleResponse['entries'][number]> = {}) => ({
  id: 'e1',
  description: 'Rent',
  kind: 'FIXED' as const,
  dueDate: '2026-08-10',
  planned: -761_000,
  actual: null,
  status: 'PENDING' as const,
  isEstimate: false,
  isOverridden: false,
  variance: null,
  balance: 1_039_000,
  ...overrides,
});

const renderPage = () =>
  renderWithProviders(
    <RouterProvider
      router={createMemoryRouter([{ path: '/', element: <LedgerPage /> }])}
    />,
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LedgerPage', () => {
  // UC-3.1 — the whole model at a glance, always in the same order.
  it('shows the calculation chain in order', async () => {
    stubApi({
      '/api/cycles': window,
      '/api/cycles/2026-08': cycle(),
    });
    renderPage();

    await screen.findByText('Opening');

    const labels = screen
      .getAllByText(
        /^(Opening|Total Outcome|Surplus|Expected Surplus|Allocations|Net Surplus|Closing)$/,
      )
      .map((node) => node.textContent);

    expect(labels).toEqual([
      'Opening',
      'Total Outcome',
      'Surplus',
      'Expected Surplus',
      'Allocations',
      'Net Surplus',
      'Closing',
    ]);
  });

  it('explains an empty cycle rather than showing a blank table', async () => {
    stubApi({ '/api/cycles': window, '/api/cycles/2026-08': cycle() });
    renderPage();

    expect(
      await screen.findByText('Nothing in this cycle yet'),
    ).toBeInTheDocument();
  });

  // UC-3.2 — the balance after each entry is what answers "when".
  it('shows each entry with the balance standing after it', async () => {
    stubApi({
      '/api/cycles': window,
      '/api/cycles/2026-08': cycle({ entries: [entry()] }),
    });
    renderPage();

    // Scoped to the row: the same figure is also the chain's closing balance.
    const row = (await screen.findByText('Rent')).closest('tr');

    expect(row).toHaveTextContent('10/08/2026');
    expect(row).toHaveTextContent('-R$ 7.610,00');
    expect(row).toHaveTextContent('R$ 10.390,00');
  });

  it('offers to settle an unsettled entry', async () => {
    stubApi({
      '/api/cycles': window,
      '/api/cycles/2026-08': cycle({ entries: [entry()] }),
    });
    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Settle' }),
    ).toBeInTheDocument();
  });

  it('offers nothing to settle once an entry is paid', async () => {
    stubApi({
      '/api/cycles': window,
      '/api/cycles/2026-08': cycle({
        entries: [entry({ status: 'PAID', actual: -761_000 })],
      }),
    });
    renderPage();

    await screen.findByText('Rent');

    expect(screen.queryByRole('button', { name: 'Settle' })).toBeNull();
  });

  // The case the running balance exists for.
  it('warns about the date the balance goes negative', async () => {
    stubApi({
      '/api/cycles': window,
      '/api/cycles/2026-08': cycle({
        firstNegativeDate: '2026-08-10',
        entries: [entry({ balance: -120_000 })],
      }),
    });
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The balance goes negative on 10/08/2026',
    );
  });

  it('marks an overridden entry', async () => {
    stubApi({
      '/api/cycles': window,
      '/api/cycles/2026-08': cycle({
        entries: [entry({ isOverridden: true })],
      }),
    });
    renderPage();

    expect(await screen.findByText('overridden')).toBeInTheDocument();
  });
});
