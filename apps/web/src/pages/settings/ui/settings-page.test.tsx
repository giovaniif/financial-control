import { screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, stubApi } from '@/shared/testing';

import { SettingsPage } from './settings-page.js';

const anchor = { anchorDay: 5, shiftPolicy: 'PRECEDING' };

const renderPage = () =>
  renderWithProviders(
    <RouterProvider
      router={createMemoryRouter([{ path: '/', element: <SettingsPage /> }])}
    />,
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SettingsPage', () => {
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
    // name, so this scopes to the settings card's row.
    const row = (await screen.findAllByText('Inter'))
      .map((node) => node.closest('li'))
      .find((node) => node !== null);

    expect(row).toHaveTextContent('checking');
    expect(row).toHaveTextContent('R$ 1.660,00');
    expect(screen.getAllByText('In accounts now')).toHaveLength(2);
  });

  // UC-1.5 — the app ships empty, so first run is an ordered checklist.
  it('shows the first-run checklist with each step state', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(await screen.findByText('First run')).toBeInTheDocument();
    expect(screen.getByText('0 accounts')).toBeInTheDocument();
    expect(screen.getByText('0 templates')).toBeInTheDocument();
  });

  it('states the formatting conventions explicitly', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(await screen.findByText('R$ 1.234,56')).toBeInTheDocument();
    expect(screen.getByText('dd/MM/yyyy')).toBeInTheDocument();
    expect(screen.getByText('August 2026 (5 Aug – 3 Sep)')).toBeInTheDocument();
  });

  it('offers to change the anchor, behind its preview', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Change the anchor' }),
    ).toBeInTheDocument();
  });

  it('offers to add an account when there are none', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Add account' }),
    ).toBeInTheDocument();
  });

  // UC-1.5 — a checklist that only counts is a report, not a checklist.
  it('links each checklist step to where the step is done', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(
      await screen.findByRole('link', { name: 'Credit cards' }),
    ).toHaveAttribute('href', '/cards');
    expect(screen.getByRole('link', { name: 'Buckets' })).toHaveAttribute(
      'href',
      '/buckets',
    );
  });
});
