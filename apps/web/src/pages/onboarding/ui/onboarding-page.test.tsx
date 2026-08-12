import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { hasSkippedSetup } from '@/shared/model';
import { renderWithProviders, stubApi } from '@/shared/testing';

import { OnboardingPage } from './onboarding-page.js';

const renderPage = () =>
  renderWithProviders(
    <RouterProvider
      router={createMemoryRouter(
        [
          { path: '/onboarding', element: <OnboardingPage /> },
          { path: '/', element: <p>Dashboard</p> },
        ],
        { initialEntries: ['/onboarding'] },
      )}
    />,
  );

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OnboardingPage', () => {
  it('opens on the first step', async () => {
    stubApi({});
    renderPage();

    expect(
      await screen.findByRole('heading', { level: 1, name: /Why this app/ }),
    ).toBeInTheDocument();
  });

  // There is nothing to navigate to yet, and a sidebar full of empty screens
  // is the thing the wizard exists to avoid showing.
  it('renders without the app shell', async () => {
    stubApi({});
    renderPage();

    await screen.findByRole('heading', { level: 1 });

    expect(
      screen.queryByRole('navigation', { name: 'Main' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('In accounts now')).not.toBeInTheDocument();
  });

  it('cannot go back from the first step', async () => {
    stubApi({});
    renderPage();

    expect(await screen.findByRole('button', { name: 'Back' })).toBeDisabled();
  });

  it('advances to the next step and back again', async () => {
    stubApi({});
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: /Next|Continue/ }),
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: /payday cycle/i }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: /Why this app/ }),
    ).toBeInTheDocument();
  });

  it('marks the current step in the indicator', async () => {
    stubApi({});
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: /Next|Continue/ }),
    );

    const current = screen
      .getAllByRole('listitem')
      .find((li) => li.getAttribute('aria-current') === 'step');

    expect(current).toHaveTextContent('The payday cycle');
  });

  // The app stays fully usable without finishing setup; that escape hatch is
  // what makes an automatic redirect acceptable in the first place.
  it('lets the user leave for the app', async () => {
    stubApi({});
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Skip for now' }),
    );

    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
    expect(hasSkippedSetup()).toBe(true);
  });

  // A step change that only swaps the body leaves a screen reader on the old
  // heading, so the new one takes focus.
  it('moves focus to the new step heading', async () => {
    stubApi({});
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: /Next|Continue/ }),
    );

    expect(await screen.findByRole('heading', { level: 1 })).toHaveFocus();
  });
});
