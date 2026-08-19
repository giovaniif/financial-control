import type { CycleWindowResponse } from '@fin/contracts';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, stubApi } from '@/shared/testing';

import { AppShell } from './app-shell.js';

const window_: CycleWindowResponse = {
  estimates: 'included',
  cycles: [
    {
      month: '2026-07',
      label: 'July 2026',
      start: '2026-07-03',
      end: '2026-08-04',
      position: 'current',
      status: 'OPEN',
      openingBalance: 0,
      closingBalance: 0,
      netSurplus: 0,
      isMaterialised: true,
    },
    {
      month: '2026-08',
      label: 'August 2026',
      start: '2026-08-05',
      end: '2026-09-04',
      position: 'next',
      status: 'OPEN',
      openingBalance: 0,
      closingBalance: 0,
      netSurplus: 0,
      isMaterialised: false,
    },
  ],
};

function renderShell(initialEntry = '/') {
  return renderWithProviders(
    <RouterProvider
      router={createMemoryRouter(
        [
          {
            path: '/',
            element: (
              <AppShell title="Main" subtitle="The next payday">
                <p>screen body</p>
              </AppShell>
            ),
          },
        ],
        { initialEntries: [initialEntry] },
      )}
    />,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AppShell', () => {
  it('carries the screen title and its body', async () => {
    stubApi({ '/api/cycles': window_ });
    renderShell();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Main' }),
    ).toBeInTheDocument();
    expect(screen.getByText('screen body')).toBeInTheDocument();
  });

  // The seven screens became three, and the sidebar is where that is felt.
  it('navigates to the three screens and nothing else', async () => {
    stubApi({ '/api/cycles': window_ });
    renderShell();

    const links = await screen.findAllByRole('link');

    expect(links.map((link) => link.textContent)).toEqual([
      'Main',
      'Profile',
      'Investments & Savings',
    ]);
  });

  // UC-1.2 — the app's starting cash, permanently visible.
  it('shows the accounts total in the sidebar', async () => {
    stubApi({
      '/api/cycles': window_,
      '/api/accounts': {
        accounts: [
          { id: 'a', name: 'Inter', type: 'CHECKING', balance: 200_000 },
          { id: 'b', name: 'Cash', type: 'CASH', balance: 16_000 },
        ],
        total: 216_000,
      },
    });
    renderShell();

    expect(await screen.findByText('R$ 2.160,00')).toBeInTheDocument();
    expect(screen.getByText('2 accounts')).toBeInTheDocument();
  });

  it('says "1 account" rather than "1 accounts"', async () => {
    stubApi({
      '/api/cycles': window_,
      '/api/accounts': {
        accounts: [{ id: 'a', name: 'Inter', type: 'CHECKING', balance: 1 }],
        total: 1,
      },
    });
    renderShell();

    expect(await screen.findByText('1 account')).toBeInTheDocument();
  });

  // A cycle is not a month, so its bounds are always stated.
  it('opens on the current cycle with its date range and position', async () => {
    stubApi({ '/api/cycles': window_ });
    renderShell();

    expect(await screen.findByText('July 2026')).toBeInTheDocument();
    expect(screen.getByText('3 Jul – 4 Aug')).toBeInTheDocument();
    expect(screen.getByText('current')).toBeInTheDocument();
  });

  it('cannot step back past the first cycle in the window', async () => {
    stubApi({ '/api/cycles': window_ });
    renderShell();

    expect(
      await screen.findByRole('button', { name: 'Previous cycle' }),
    ).toBeDisabled();
  });

  it('steps forward to the next cycle and back again', async () => {
    stubApi({ '/api/cycles': window_ });
    renderShell();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Next cycle' }),
    );

    expect(await screen.findByText('August 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next cycle' })).toBeDisabled();

    await userEvent.click(
      screen.getByRole('button', { name: 'Previous cycle' }),
    );

    await waitFor(() => {
      expect(screen.getByText('July 2026')).toBeInTheDocument();
    });
  });

  // The URL is the source of truth, so a cycle link survives a reload.
  it('respects a cycle named in the URL', async () => {
    stubApi({ '/api/cycles': window_ });
    renderShell('/?cycle=2026-08');

    expect(await screen.findByText('August 2026')).toBeInTheDocument();
    expect(screen.getByText('next')).toBeInTheDocument();
  });

  it('shows no cycle nav when the window is empty', async () => {
    stubApi({ '/api/cycles': { estimates: 'included', cycles: [] } });
    renderShell();

    expect(await screen.findByText('screen body')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Next cycle' }),
    ).not.toBeInTheDocument();
  });
});
