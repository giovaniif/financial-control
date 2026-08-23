import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, stubApi } from '@/shared/testing';

import { OnboardingPage } from '../onboarding-page.js';

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

const attach = async (
  label: RegExp | string,
  contents = 'bytes',
  filename = 'backup.json',
) => {
  await userEvent.upload(
    screen.getByLabelText(label),
    new File([contents], filename),
  );
};

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('choosing how to start', () => {
  it('offers the two ways to start', async () => {
    stubApi({});
    renderPage();

    expect(
      await screen.findByRole('radio', { name: /From a backup/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /From scratch/ }),
    ).toBeInTheDocument();
  });

  it('goes on freely when starting from scratch', async () => {
    stubApi({});
    renderPage();
    await userEvent.click(
      await screen.findByRole('radio', { name: /From scratch/ }),
    );

    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });
});

describe('starting from a backup', () => {
  const chooseBackup = async () => {
    renderPage();
    await userEvent.click(
      await screen.findByRole('radio', { name: /From a backup/ }),
    );
  };

  it('warns that restoring replaces everything', async () => {
    stubApi({});
    await chooseBackup();

    expect(
      screen.getByText(/Restoring replaces the whole dataset/),
    ).toBeInTheDocument();
  });

  it('will not go on without restoring, having promised a restore', async () => {
    stubApi({});
    await chooseBackup();

    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(screen.getByText(/Restore the backup to go on/)).toBeInTheDocument();
  });

  it('refuses a file that is not a backup', async () => {
    stubApi({});
    await chooseBackup();
    await attach('Your backup file', 'not json', 'backup.json');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That file is not a backup this app wrote.',
    );
  });

  // A backup is already a complete dataset, so the teaching steps are moot.
  it('goes straight to the finish once restored', async () => {
    stubApi({ '/api/restore': null });
    await chooseBackup();
    await attach(
      'Your backup file',
      JSON.stringify({ version: 1 }),
      'backup.json',
    );

    await userEvent.click(
      await screen.findByRole('button', { name: 'Restore this backup' }),
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'You are set up' }),
    ).toBeInTheDocument();
  });
});
