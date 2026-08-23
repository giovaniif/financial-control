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

const attach = async (contents: string) => {
  await userEvent.upload(
    screen.getByLabelText('Your backup file'),
    new File([contents], 'backup.json'),
  );
};

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

  // UC-1.6 — a backup is already a complete dataset, so it needs none of the
  // conversation.
  describe('starting from a backup instead', () => {
    it('warns that restoring replaces everything', async () => {
      stubApi({});
      renderPage();

      expect(
        await screen.findByText(/Restoring replaces the whole dataset/),
      ).toBeInTheDocument();
    });

    it('is not offered once the app has data to lose', async () => {
      stubApi({
        '/api/setup': {
          anchorConfigured: true,
          accounts: 2,
          cards: 1,
          templates: 4,
          buckets: 3,
          isPristine: false,
          assistantAvailable: true,
        },
      });
      renderPage();

      await screen.findByLabelText('Your answer');

      expect(
        screen.queryByLabelText('Your backup file'),
      ).not.toBeInTheDocument();
    });

    it('refuses a file that is not a backup', async () => {
      stubApi({});
      renderPage();
      await screen.findByLabelText('Your backup file');
      await attach('not json');

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'That file is not a backup this app wrote.',
      );
    });

    it('says the app is ready once a backup is restored', async () => {
      stubApi({ '/api/restore': null });
      renderPage();
      await screen.findByLabelText('Your backup file');
      await attach(JSON.stringify({ version: 1 }));

      await userEvent.click(
        screen.getByRole('button', { name: 'Restore this backup' }),
      );

      expect(
        await screen.findByText(/Your backup is restored/),
      ).toBeInTheDocument();
    });
  });
});
