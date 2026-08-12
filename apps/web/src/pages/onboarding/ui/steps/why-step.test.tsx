import type { SpreadsheetReading } from '@fin/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, stubApi } from '@/shared/testing';

import { OnboardingPage } from '../onboarding-page.js';

const reading: SpreadsheetReading = {
  months: [
    {
      month: '2026-09',
      monthName: 'Setembro',
      isBlank: false,
      salary: 3_500_000,
      outcomes: [{ label: 'Convênio', amount: -29_300 }],
      variables: [],
      allocations: [],
      balances: [],
      derived: {
        totalOutcome: -29_300,
        surplus: 3_470_700,
        expectedSurplus: 3_470_700,
        netSurplus: 3_470_700,
      },
    },
  ],
  currentMonth: '2026-09',
  outcomeLabels: ['Convênio', 'Energia'],
  buckets: [
    {
      name: 'Reserva',
      rule: { kind: 'PERCENT', percent: 20 },
      latestBalance: 500_000,
      balanceWasOverwritten: true,
    },
  ],
  inference: {
    firstColumnYear: 2025,
    reasoning: 'Today is in Agosto 2026, so the first column is 2025.',
  },
  missing: ['The payday anchor — the sheet holds no dates at all.'],
  warnings: ['Saude - Tractian carries an amount the totals do not include.'],
};

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

const chooseSpreadsheet = async () => {
  renderPage();
  await userEvent.click(
    await screen.findByRole('radio', { name: /From my spreadsheet/ }),
  );
};

const attach = async (
  label: RegExp | string,
  contents = 'bytes',
  filename = 'sheet.xlsx',
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

describe('starting from a spreadsheet', () => {
  it('offers the three ways to start', async () => {
    stubApi({});
    renderPage();

    expect(
      await screen.findByRole('radio', { name: /From my spreadsheet/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /From a backup/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /From scratch/ }),
    ).toBeInTheDocument();
  });

  it('promises nothing is written by the upload itself', async () => {
    stubApi({});
    await chooseSpreadsheet();

    expect(screen.getByText(/Nothing is saved yet/)).toBeInTheDocument();
  });

  /**
   * Walking past the upload would land the user in the from-scratch flow
   * having just been told their spreadsheet would be imported.
   */
  it('will not go on until a spreadsheet has been chosen', async () => {
    stubApi({ '/api/import/spreadsheet': reading });
    await chooseSpreadsheet();

    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(
      screen.getByText('Choose your spreadsheet to go on.'),
    ).toBeInTheDocument();
  });

  it('goes on once the spreadsheet has been read', async () => {
    stubApi({ '/api/import/spreadsheet': reading });
    await chooseSpreadsheet();
    await attach('Your spreadsheet');
    await screen.findByText('1 months');

    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('goes on freely when starting from scratch', async () => {
    stubApi({});
    renderPage();
    await userEvent.click(
      await screen.findByRole('radio', { name: /From scratch/ }),
    );

    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('reports what was read', async () => {
    stubApi({ '/api/import/spreadsheet': reading });
    await chooseSpreadsheet();
    await attach('Your spreadsheet');

    expect(await screen.findByText('1 months')).toBeInTheDocument();
    expect(screen.getByText('2 bills')).toBeInTheDocument();
    expect(screen.getByText('1 buckets')).toBeInTheDocument();
  });

  /**
   * The sheet names months but never years, so the mapping is inferred. A
   * wrong year files everything a cycle out, and has to be caught before
   * anything is written rather than after.
   */
  it('shows the inferred year mapping with its reasoning', async () => {
    stubApi({ '/api/import/spreadsheet': reading });
    await chooseSpreadsheet();
    await attach('Your spreadsheet');

    expect(
      await screen.findByText(/the first column is 2025/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('First column is')).toHaveValue(2025);
  });

  it('re-reads the same file against a corrected year', async () => {
    stubApi({ '/api/import/spreadsheet': reading });
    await chooseSpreadsheet();
    await attach('Your spreadsheet');

    const year = await screen.findByLabelText('First column is');
    await userEvent.clear(year);
    await userEvent.type(year, '2024');
    await userEvent.click(
      screen.getByRole('button', { name: 'Re-read with this year' }),
    );

    const calls = vi
      .mocked(fetch)
      .mock.calls.map(([input]) => (typeof input === 'string' ? input : ''));
    expect(calls.some((url) => url.includes('firstColumnYear=2024'))).toBe(
      true,
    );
  });

  it('states what the sheet cannot tell us', async () => {
    stubApi({ '/api/import/spreadsheet': reading });
    await chooseSpreadsheet();
    await attach('Your spreadsheet');

    expect(
      await screen.findByText(/the sheet holds no dates at all/),
    ).toBeInTheDocument();
    expect(screen.getByText(/The next steps ask for each/)).toBeInTheDocument();
  });

  it('passes the sheet own warnings on', async () => {
    stubApi({ '/api/import/spreadsheet': reading });
    await chooseSpreadsheet();
    await attach('Your spreadsheet');

    expect(await screen.findByText(/Saude - Tractian/)).toBeInTheDocument();
  });

  it('keeps the reading when the user moves on and comes back', async () => {
    stubApi({ '/api/import/spreadsheet': reading });
    await chooseSpreadsheet();
    await attach('Your spreadsheet');
    await screen.findByText('1 months');

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(await screen.findByText('1 months')).toBeInTheDocument();
  });

  // A wrong file is a mistake, not a dead end.
  it('explains a file the server could not read, and stays usable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        const failing = input.includes('/import/');

        return Promise.resolve(
          new Response(
            JSON.stringify(
              failing ? { error: 'That file is not a spreadsheet.' } : {},
            ),
            {
              status: failing ? 400 : 200,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        );
      }),
    );
    await chooseSpreadsheet();
    await attach('Your spreadsheet');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That file is not a spreadsheet.',
    );
    expect(screen.getByLabelText('Your spreadsheet')).toBeEnabled();
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
