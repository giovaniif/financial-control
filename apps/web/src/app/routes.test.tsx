import { screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, stubApi } from '@/shared/testing';

import { routes } from './routes.js';

/** Every screen sits behind the first-run gate, which a pristine app fails. */
const configured = {
  anchorConfigured: true,
  accounts: 1,
  cards: 1,
  templates: 1,
  buckets: 1,
  isPristine: false,
};

function renderAt(path: string) {
  return renderWithProviders(
    <RouterProvider
      router={createMemoryRouter(routes, { initialEntries: [path] })}
    />,
  );
}

beforeEach(() => {
  stubApi({ '/api/setup': configured });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('routes', () => {
  it.each([
    ['/', 'Dashboard'],
    ['/ledger', 'Cycle Ledger'],
    ['/cards', 'Cards & Invoices'],
    ['/buckets', 'Buckets & Goals'],
    ['/wealth', 'Wealth Projection'],
    ['/templates', 'Recurring Templates'],
    ['/settings', 'Settings'],
    ['/onboarding', 'Why this app exists'],
  ])('renders %s as the %s screen', async (path, heading) => {
    renderAt(path);

    expect(
      await screen.findByRole('heading', { level: 1, name: heading }),
    ).toBeInTheDocument();
  });

  it('shows a not-found screen for an unknown route', async () => {
    renderAt('/nowhere');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeInTheDocument();
  });
});
