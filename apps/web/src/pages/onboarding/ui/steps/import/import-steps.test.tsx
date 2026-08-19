import type { SpreadsheetReading } from '@fin/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, stubApi } from '@/shared/testing';

import { OnboardingPage } from '../../onboarding-page.js';

const month = (
  monthName: string,
  monthKey: string,
  obra: number,
  salary = 3_500_000,
) => ({
  month: monthKey,
  monthName,
  isBlank: false,
  salary,
  outcomes: [
    { label: 'Convênio', amount: -29_300 },
    { label: 'Evoluçao Obra', amount: obra },
    { label: 'Inter', amount: -900_000 },
  ],
  variables: [],
  allocations: [],
  balances: [],
  derived: {
    totalOutcome: -29_300 + obra - 900_000,
    surplus: null,
    expectedSurplus: null,
    netSurplus: null,
  },
});

const reading: SpreadsheetReading = {
  months: [
    month('Agosto', '2026-08', -260_000),
    month('Setembro', '2026-09', -265_000),
    month('Outubro', '2026-10', -292_400),
  ],
  currentMonth: '2026-08',
  outcomeLabels: ['Convênio', 'Evoluçao Obra', 'Inter'],
  buckets: [
    {
      name: 'Reserva',
      rule: { kind: 'PERCENT', percent: 20 },
      latestBalance: 3_439_729,
      balanceWasOverwritten: true,
    },
  ],
  inference: { firstColumnYear: 2026, reasoning: 'Anchored on Agosto 2026.' },
  missing: ['The payday anchor — the sheet holds no dates at all.'],
  warnings: [],
};

const report = {
  imported: {
    templates: 4,
    accounts: 1,
    cards: 1,
    buckets: 1,
    months: 3,
  },
  mismatches: [],
  notes: ['Cycles before 2026-08 were left out.'],
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

/** Uploads the sheet, then walks to the named step. */
async function reach(title: string) {
  renderPage();
  await userEvent.click(
    await screen.findByRole('radio', { name: /From my spreadsheet/ }),
  );
  await userEvent.upload(
    screen.getByLabelText('Your spreadsheet'),
    new File(['bytes'], 'sheet.xlsx'),
  );
  await screen.findByText('3 months');

  for (let step = 0; step < 8; step += 1) {
    if (screen.getByRole('heading', { level: 1 }).textContent === title) {
      return;
    }
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  }
  throw new Error(`Never reached ${title}`);
}

beforeEach(() => {
  sessionStorage.clear();
  stubApi({
    '/api/import/spreadsheet': reading,
    '/api/import/spreadsheet/apply': report,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the wizard with a spreadsheet behind it', () => {
  it('asks which outcome rows are credit cards', async () => {
    await reach('Credit cards and their invoices');

    expect(screen.getByRole('checkbox', { name: 'Inter' })).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Convênio' }),
    ).toBeInTheDocument();
  });

  it('asks for the day pair only once a row is a card', async () => {
    await reach('Credit cards and their invoices');

    expect(screen.queryByLabelText('Closing day')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Inter' }));

    expect(screen.getByLabelText('Closing day')).toHaveValue(28);
    expect(screen.getByLabelText('Due day')).toHaveValue(10);
  });

  it('pre-fills the bills and asks each for a due day', async () => {
    await reach('What repeats every cycle');

    expect(screen.getByText('Convênio')).toBeInTheDocument();
    expect(screen.getByText('Salário')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Due day')).toHaveLength(4);
  });

  /**
   * The salary is the wage received, not a bill to be paid. Listing it among
   * the outgoings told the user the app had misread the largest figure in
   * their sheet, when what it actually imports is an income template.
   */
  it('presents the salary as income rather than as one of the bills', async () => {
    await reach('What repeats every cycle');

    const income = within(
      screen.getByRole('region', { name: 'Money coming in' }),
    );
    const bills = within(
      screen.getByRole('region', { name: 'The bills that repeat' }),
    );

    expect(income.getByText('Salário')).toBeInTheDocument();
    expect(bills.queryByText('Salário')).not.toBeInTheDocument();
    expect(bills.getByText('Convênio')).toBeInTheDocument();
  });

  it('says the salary arrives, and only the bills leave', async () => {
    await reach('What repeats every cycle');

    const income = within(
      screen.getByRole('region', { name: 'Money coming in' }),
    );
    const bills = within(
      screen.getByRole('region', { name: 'The bills that repeat' }),
    );

    expect(income.getByText(/the day it arrives/)).toBeInTheDocument();
    expect(income.queryByText(/leaves/)).not.toBeInTheDocument();
    expect(bills.getByText(/the money actually leaves/)).toBeInTheDocument();
  });

  // The one figure every cycle boundary is measured from is not a guess.
  it('does not offer to mark the salary an estimate', async () => {
    await reach('What repeats every cycle');

    const income = within(
      screen.getByRole('region', { name: 'Money coming in' }),
    );
    const bills = within(
      screen.getByRole('region', { name: 'The bills that repeat' }),
    );

    expect(income.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(bills.getAllByRole('checkbox')).toHaveLength(3);
  });

  it('still asks the salary for the day it lands', async () => {
    await reach('What repeats every cycle');

    const income = within(
      screen.getByRole('region', { name: 'Money coming in' }),
    );

    await userEvent.type(income.getByLabelText('Due day'), '5');

    expect(income.getByLabelText('Due day')).toHaveValue(5);
  });

  it('shows no income group when the sheet carries no salary', async () => {
    stubApi({
      '/api/import/spreadsheet': {
        ...reading,
        months: reading.months.map((month) => ({ ...month, salary: null })),
      },
      '/api/import/spreadsheet/apply': report,
    });

    await reach('What repeats every cycle');

    expect(
      screen.queryByRole('region', { name: 'Money coming in' }),
    ).not.toBeInTheDocument();
    expect(
      within(
        screen.getByRole('region', { name: 'The bills that repeat' }),
      ).getByText('Convênio'),
    ).toBeInTheDocument();
  });

  /**
   * UC-2.4 — a renovation climbing across the months is one template with a
   * value schedule, not four separate bills.
   */
  it('shows an amount that steps as one chain, not several bills', async () => {
    await reach('What repeats every cycle');

    expect(
      screen.getByText('-R$ 2.600,00 → -R$ 2.650,00 → -R$ 2.924,00'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Evoluçao Obra')).toHaveLength(1);
  });

  it('drops a row from the bills once it is marked a card', async () => {
    await reach('Credit cards and their invoices');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Inter' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.queryByText('Inter')).not.toBeInTheDocument();
  });

  it('shows the bucket rules it read off the formulas', async () => {
    await reach('What you are saving for');

    expect(screen.getByText('20% per cycle')).toBeInTheDocument();
    expect(screen.getByText('Reserva')).toBeInTheDocument();
  });

  // UC-6.1 — a goal without both is not a goal.
  it('will not let a goal go without a target and a date', async () => {
    await reach('What you are saving for');
    await userEvent.click(screen.getByRole('radio', { name: 'goal' }));

    expect(screen.getByText('A goal needs a target.')).toBeInTheDocument();
    expect(
      screen.getByText('And the date you want it by.'),
    ).toBeInTheDocument();
  });

  /**
   * UC-6.7 — the spreadsheet typed the balance over its own running total, so
   * it comes in as a correction rather than as money the app watched accrue.
   */
  it('flags a balance the sheet typed over its running total', async () => {
    await reach('What you are saving for');

    expect(
      screen.getByText(/the history behind it is gone/),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Reserva opening balance'),
    ).toBeInTheDocument();
  });

  it('reconciles against the sheet when the import lands', async () => {
    await reach('You are set up');
    await userEvent.click(
      screen.getByRole('button', { name: 'Load my spreadsheet' }),
    );

    expect(
      await screen.findByText('Every cycle reconciles exactly.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Cycles before 2026-08/)).toBeInTheDocument();
  });

  it('reports a figure that came out differently', async () => {
    stubApi({
      '/api/import/spreadsheet': reading,
      '/api/import/spreadsheet/apply': {
        ...report,
        mismatches: [
          {
            month: '2026-09',
            figure: 'totalOutcome',
            sheet: -1_194_300,
            imported: -1_189_300,
          },
        ],
      },
    });
    await reach('You are set up');
    await userEvent.click(
      screen.getByRole('button', { name: 'Load my spreadsheet' }),
    );

    expect(await screen.findByText('Total Gasto')).toBeInTheDocument();
    expect(
      screen.queryByText('Every cycle reconciles exactly.'),
    ).not.toBeInTheDocument();
  });

  // In import mode the anchor travels in the answers: writing it on the way
  // through would be wiped by the restore that applying runs.
  it('does not write the anchor on the way through', async () => {
    await reach('You are set up');

    const put = vi
      .mocked(fetch)
      .mock.calls.filter(([, init]) => init?.method === 'PUT');
    expect(put).toHaveLength(0);
  });
});
