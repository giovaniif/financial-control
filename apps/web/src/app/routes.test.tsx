import { screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '@/shared/testing';

import { routes } from './routes.js';

function renderAt(path: string) {
  return renderWithProviders(
    <RouterProvider
      router={createMemoryRouter(routes, { initialEntries: [path] })}
    />,
  );
}

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
