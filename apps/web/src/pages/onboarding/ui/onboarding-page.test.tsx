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
          { path: '/', element: <p>Main</p> },
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
  it('opens on the conversation when the assistant is available', async () => {
    stubApi({});
    renderPage();

    expect(await screen.findByLabelText('Your answer')).toBeInTheDocument();
  });

  // There is nothing to navigate to yet, and a sidebar full of empty screens
  // is the thing the first run exists to avoid showing.
  it('renders without the app shell', async () => {
    stubApi({});
    renderPage();

    await screen.findByRole('heading', { level: 1 });

    expect(
      screen.queryByRole('navigation', { name: 'Main' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('In accounts now')).not.toBeInTheDocument();
  });

  // The app stays fully usable without finishing setup; that escape hatch is
  // what makes an automatic redirect acceptable in the first place.
  it('lets the user leave for the app', async () => {
    stubApi({});
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Skip for now' }),
    );

    expect(await screen.findByText('Main')).toBeInTheDocument();
    expect(hasSkippedSetup()).toBe(true);
  });

  // UC-1.6 — restore stays on Profile. On a first run it competes with the one
  // decision this screen exists to get someone through.
  it('offers no way to start from a backup instead', async () => {
    stubApi({});
    renderPage();

    await screen.findByLabelText('Your answer');

    expect(screen.queryByLabelText('Your backup file')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /restore/i })).toBeNull();
  });
});
