import { screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { skipSetup } from '@/shared/model';
import { renderWithProviders, stubApi } from '@/shared/testing';

import { routes } from './routes.js';

const configured = {
  anchorConfigured: true,
  accounts: 2,
  cards: 1,
  templates: 4,
  buckets: 3,
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
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the first-run gate', () => {
  it('sends a pristine app to the wizard', async () => {
    stubApi({});
    renderAt('/');

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Setting up',
      }),
    ).toBeInTheDocument();
  });

  it('sends a pristine app to the wizard from any route', async () => {
    stubApi({});
    renderAt('/profile');

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Setting up',
      }),
    ).toBeInTheDocument();
  });

  it('leaves a configured app alone', async () => {
    stubApi({ '/api/setup': configured });
    renderAt('/profile');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Profile' }),
    ).toBeInTheDocument();
  });

  /**
   * Redirecting before the answer arrives shows the wizard to a configured
   * app; rendering before it arrives shows a dashboard of zeros to an empty
   * one. Neither flash is acceptable, so the gate waits.
   */
  it('shows neither the app nor the wizard while it does not know yet', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => undefined)),
    );
    renderAt('/');

    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('stops redirecting once the user has skipped', async () => {
    skipSetup();
    stubApi({});
    renderAt('/profile');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Profile' }),
    ).toBeInTheDocument();
  });
});
