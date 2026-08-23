import type { CardResponse, TemplateResponse } from '@fin/contracts';
import { screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, stubApi } from '@/shared/testing';

import { ProfilePage } from './profile-page.js';

const anchor = { anchorDay: 5, shiftPolicy: 'PRECEDING' };

const pristine = {
  anchorConfigured: false,
  accounts: 0,
  cards: 0,
  templates: 0,
  buckets: 0,
  isPristine: true,
};

const template = (
  overrides: Partial<TemplateResponse> = {},
): TemplateResponse => ({
  id: 't1',
  name: 'Health Plan',
  direction: 'OUT',
  dueDayOfMonth: 8,
  amount: -32_000,
  startMonth: '2026-08',
  endMonth: null,
  nextOccurrenceMonth: '2026-09',
  status: 'ACTIVE',
  isEstimate: false,
  valueSchedule: [],
  ...overrides,
});

const card = (overrides: Partial<CardResponse> = {}): CardResponse => ({
  id: 'inter',
  name: 'Inter',
  limit: 1_000_000,
  closingDay: 28,
  dueDay: 10,
  paymentAccountId: 'a1',
  committedToFuture: 240_000,
  available: 760_000,
  invoices: [],
  ...overrides,
});

const withTemplates = (templates: TemplateResponse[]) => ({
  templates,
  summary: {
    fixedCommitment: 32_000,
    activeOutcomeCount: templates.length,
    fixedIncome: 1_800_000,
    unconfirmedEstimates: 0,
    endingWithinTwelve: [],
  },
});

const renderPage = () =>
  renderWithProviders(
    <RouterProvider
      router={createMemoryRouter([{ path: '/', element: <ProfilePage /> }])}
    />,
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ProfilePage', () => {
  it('states the payday anchor in plain language', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(await screen.findByText(/Salary lands on day/)).toBeInTheDocument();
    expect(screen.getByText(/preceding/)).toBeInTheDocument();
  });

  // Changing it re-slices every open cycle, so it is never silent.
  it('warns that changing the anchor re-slices open cycles', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(
      await screen.findByText(/Closed cycles are never touched/),
    ).toBeInTheDocument();
  });

  it('offers to change the anchor, behind its preview', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Change the anchor' }),
    ).toBeInTheDocument();
  });

  it('lists the accounts with the total they add up to', async () => {
    stubApi({
      '/api/settings/anchor': anchor,
      '/api/accounts': {
        accounts: [
          { id: 'a', name: 'Inter', type: 'CHECKING', balance: 166_000 },
        ],
        total: 166_000,
      },
    });
    renderPage();

    // The sidebar carries the same total and the manage control repeats each
    // name, so this scopes to the accounts card's row.
    const row = (await screen.findAllByText('Inter'))
      .map((node) => node.closest('li'))
      .find((node) => node !== null);

    expect(row).toHaveTextContent('checking');
    expect(row).toHaveTextContent('R$ 1.660,00');
  });

  it('offers to add an account when there are none', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Add account' }),
    ).toBeInTheDocument();
  });

  // UC-2 — the recurring templates moved here in full, as salary and bills.
  it('lists the recurring bills with what they commit per cycle', async () => {
    stubApi({
      '/api/settings/anchor': anchor,
      '/api/templates': withTemplates([template()]),
    });
    renderPage();

    expect(await screen.findByText('Health Plan')).toBeInTheDocument();
    expect(screen.getByText('day 8')).toBeInTheDocument();
    expect(screen.getByText('Fixed commitment / cycle')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Edit Health Plan' }),
    ).toBeInTheDocument();
  });

  it('offers to create a template', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(
      await screen.findByRole('button', { name: 'New template' }),
    ).toBeInTheDocument();
  });

  // UC-5.8 — the figure the spreadsheet could not produce.
  it('shows each card with what is already committed to future invoices', async () => {
    stubApi({
      '/api/settings/anchor': anchor,
      '/api/cards': [card()],
    });
    renderPage();

    expect(await screen.findByText('Inter')).toBeInTheDocument();
    expect(screen.getByText('closes 28 · due 10')).toBeInTheDocument();
    expect(screen.getByText('Committed')).toBeInTheDocument();
    expect(screen.getByText('R$ 2.400,00')).toBeInTheDocument();
  });

  it('offers to configure a card once there is an account to pay it from', async () => {
    stubApi({
      '/api/settings/anchor': anchor,
      '/api/accounts': {
        accounts: [
          { id: 'a1', name: 'Inter', type: 'CHECKING', balance: 166_000 },
        ],
        total: 166_000,
      },
    });
    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Add a card' }),
    ).toBeInTheDocument();
  });

  // An invoice is settled from an account, so there is nothing to configure
  // until one exists.
  it('asks for an account before a card can be added', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(await screen.findByText(/Add an account first/)).toBeInTheDocument();
  });

  // UC-1.5 — the app ships empty, so first run is an ordered checklist.
  it('shows the first-run checklist with each step state', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(await screen.findByText('First run')).toBeInTheDocument();
    expect(screen.getByText('0 accounts')).toBeInTheDocument();
    expect(screen.getByText('0 templates')).toBeInTheDocument();
  });

  /**
   * The anchor reads back a default whether or not anyone chose it, so the
   * checklist used to claim step one was done on a completely empty app.
   */
  it('leaves the anchor step outstanding until it has been configured', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(await screen.findByText('not set yet')).toBeInTheDocument();
  });

  it('marks the anchor step done once it has been configured', async () => {
    stubApi({
      '/api/settings/anchor': anchor,
      '/api/setup': { ...pristine, anchorConfigured: true },
    });
    renderPage();

    expect(await screen.findByText('configured')).toBeInTheDocument();
  });

  // The buckets are the one step this screen does not itself carry.
  it('links the buckets step to where the buckets live', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(
      await screen.findByRole('link', { name: 'Buckets' }),
    ).toHaveAttribute('href', '/savings');
  });

  it('offers to run the setup again whatever the setup state', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(
      await screen.findByRole('link', { name: 'Run setup again' }),
    ).toHaveAttribute('href', '/onboarding');
  });

  it('states the formatting conventions explicitly', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(await screen.findByText('R$ 1.234,56')).toBeInTheDocument();
    expect(screen.getByText('dd/MM/yyyy')).toBeInTheDocument();
    expect(screen.getByText('August 2026 (5 Aug – 3 Sep)')).toBeInTheDocument();
  });

  // UC-1.6 — nothing else takes snapshots, so this is the only way back.
  it('offers the export and the import, and says why they matter', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Export' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
    expect(
      screen.getByText(/the only way back from a mistake/),
    ).toBeInTheDocument();
  });
});
