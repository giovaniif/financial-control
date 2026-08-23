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
    ['/', 'Main'],
    ['/profile', 'Profile'],
    ['/savings', 'Investments & Savings'],
    ['/onboarding', 'Setting up'],
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

  /**
   * The seven screens became three. The four that went are reachable through
   * the assistant instead, so their old paths are ordinary unknown routes —
   * not redirects to somewhere that half-answers.
   */
  it.each(['/ledger', '/cards', '/templates', '/wealth', '/settings'])(
    'no longer serves %s',
    async (path) => {
      renderAt(path);

      expect(
        await screen.findByRole('heading', {
          level: 1,
          name: 'Page not found',
        }),
      ).toBeInTheDocument();
    },
  );
});
