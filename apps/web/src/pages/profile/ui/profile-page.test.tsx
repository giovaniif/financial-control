import type {
  CardResponse,
  InvoiceResponse,
  TemplateResponse,
} from '@fin/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, stubApi } from '@/shared/testing';

import { ProfilePage } from './profile-page.js';

const anchor = { anchorDay: 5, shiftPolicy: 'PRECEDING' };

const pristine = {
  anchorConfigured: false,
  accounts: 0,
  cards: 0,
  templates: 0,
  buckets: 0,
  isPristine: true,
};

const template = (
  overrides: Partial<TemplateResponse> = {},
): TemplateResponse => ({
  id: 't1',
  name: 'Health Plan',
  direction: 'OUT',
  dueDayOfMonth: 8,
  amount: -32_000,
  startMonth: '2026-08',
  endMonth: null,
  nextOccurrenceMonth: '2026-09',
  status: 'ACTIVE',
  isEstimate: false,
  valueSchedule: [],
  ...overrides,
});

const salary = template({
  id: 'salary',
  name: 'Salary',
  direction: 'IN',
  amount: 1_800_000,
  dueDayOfMonth: 5,
});

const electricity = template({
  id: 'electricity',
  name: 'Electricity',
  amount: -28_000,
  dueDayOfMonth: 15,
  isEstimate: true,
});

const invoice = (
  overrides: Partial<InvoiceResponse> = {},
): InvoiceResponse => ({
  id: 'i1',
  periodStart: '2026-07-29',
  periodEnd: '2026-08-28',
  dueDate: '2026-09-10',
  status: 'OPEN',
  total: -120_000,
  paidInCycle: '2026-10',
  items: [],
  ...overrides,
});

const card = (overrides: Partial<CardResponse> = {}): CardResponse => ({
  id: 'inter',
  name: 'Inter',
  limit: 1_000_000,
  closingDay: 28,
  dueDay: 10,
  paymentAccountId: 'a1',
  committedToFuture: 240_000,
  available: 760_000,
  invoices: [],
  ...overrides,
});

const withTemplates = (templates: TemplateResponse[]) => ({
  templates,
  summary: {
    fixedCommitment: 32_000,
    activeOutcomeCount: templates.length,
    fixedIncome: 1_800_000,
    unconfirmedEstimates: 28_000,
    endingWithinTwelve: [],
  },
});

const renderPage = () =>
  renderWithProviders(
    <RouterProvider
      router={createMemoryRouter([{ path: '/', element: <ProfilePage /> }])}
    />,
  );

const region = (name: string) => screen.getByRole('region', { name });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ProfilePage', () => {
  /**
   * The screen is the conversation made editable, so it asks in the same
   * order: the anchor, then the accounts, then salary, bills and cards.
   */
  it('orders its sections the way the setup conversation asked them', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();
    await screen.findByText(/Salary lands on day/);

    expect(
      screen
        .getAllByRole('region')
        .map((section) => section.getAttribute('aria-label')),
    ).toEqual([
      'Payday anchor',
      'Accounts',
      'Commitments per cycle',
      'Salary',
      'Fixed bills',
      'Variable bills',
      'Credit cards',
      'Setup',
      'Formatting',
      'Backup',
    ]);
  });

  it('states the payday anchor in plain language', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(await screen.findByText(/Salary lands on day/)).toBeInTheDocument();
    expect(screen.getByText(/preceding/)).toBeInTheDocument();
  });

  // Changing it re-slices every open cycle, so it is never silent.
  it('warns that changing the anchor re-slices open cycles', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(
      await screen.findByText(/Closed cycles are never touched/),
    ).toBeInTheDocument();
  });

  // UC-1.1 — the effect is shown, and confirmed, before anything is written.
  it('will not apply an anchor change before its effect has been previewed', async () => {
    stubApi({
      '/api/settings/anchor': anchor,
      '/api/settings/anchor/preview': {
        current: anchor,
        proposed: { anchorDay: 7, shiftPolicy: 'PRECEDING' },
        shifts: [
          {
            month: '2026-08',
            currentRange: '5 Aug – 3 Sep',
            proposedRange: '7 Aug – 6 Sep',
            entriesLeaving: 3,
          },
        ],
        totalEntriesMoving: 3,
        orphanedEntries: 0,
      },
    });
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Change the anchor' }),
    );
    expect(
      screen.getByRole('button', { name: 'Apply the change' }),
    ).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '3 entries would move out of their cycle',
    );
    expect(
      screen.getByRole('button', { name: 'Apply the change' }),
    ).toBeEnabled();
  });

  it('lists the accounts with the total they add up to', async () => {
    stubApi({
      '/api/settings/anchor': anchor,
      '/api/accounts': {
        accounts: [
          { id: 'a', name: 'Inter', type: 'CHECKING', balance: 166_000 },
        ],
        total: 166_000,
      },
    });
    renderPage();

    const accounts = await screen.findByRole('region', { name: 'Accounts' });

    expect(await within(accounts).findByText('checking')).toBeInTheDocument();
    // The balance on its row, and again as the total they add up to.
    expect(within(accounts).getAllByText('R$ 1.660,00')).toHaveLength(2);
    expect(within(accounts).getByText('In accounts now')).toBeInTheDocument();
  });

  it('offers to add an account when there are none', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Add account' }),
    ).toBeInTheDocument();
  });

  /**
   * The domain calls them recurring templates. The user calls them bills, and
   * the UI answers in the user's words — the vocabulary stops here.
   */
  it('never calls a recurring bill a template', async () => {
    stubApi({
      '/api/settings/anchor': anchor,
      '/api/templates': withTemplates([salary, template(), electricity]),
    });
    renderPage();
    await screen.findByText('Health Plan');

    expect(screen.queryAllByText(/template/i)).toEqual([]);
  });

  // The conversation asked for salary, fixed bills and variable bills apart.
  it('separates the salary, the fixed bills and the variable bills', async () => {
    stubApi({
      '/api/settings/anchor': anchor,
      '/api/templates': withTemplates([salary, template(), electricity]),
    });
    renderPage();
    await screen.findByText('Health Plan');

    expect(
      within(region('Salary')).getByRole('button', { name: 'Edit Salary' }),
    ).toBeInTheDocument();
    expect(
      within(region('Fixed bills')).getByText('Health Plan'),
    ).toBeInTheDocument();
    expect(
      within(region('Variable bills')).getByText('Electricity'),
    ).toBeInTheDocument();
    expect(
      within(region('Fixed bills')).getByText('day 8'),
    ).toBeInTheDocument();
  });

  // UC-2.6 — a guess must never read as a known bill.
  it('tags a bill whose amount is unconfirmed', async () => {
    stubApi({
      '/api/settings/anchor': anchor,
      '/api/templates': withTemplates([template(), electricity]),
    });
    renderPage();
    await screen.findByText('Electricity');

    expect(
      within(region('Variable bills')).getByText('~estimate'),
    ).toBeInTheDocument();
    expect(
      within(region('Fixed bills')).queryByText('~estimate'),
    ).not.toBeInTheDocument();
  });

  // UC-2.7 — the four figures that summarise what the user is committed to.
  it('summarises what every cycle is already committed to', async () => {
    stubApi({
      '/api/settings/anchor': anchor,
      '/api/templates': withTemplates([salary, template(), electricity]),
    });
    renderPage();

    const summary = await screen.findByRole('region', {
      name: 'Commitments per cycle',
    });

    expect(within(summary).getByText('Fixed commitment')).toBeInTheDocument();
    expect(within(summary).getByText('Fixed income')).toBeInTheDocument();
    expect(
      within(summary).getByText('Unconfirmed estimates'),
    ).toBeInTheDocument();
    expect(
      within(summary).getByText('Ending within 12 cycles'),
    ).toBeInTheDocument();
    expect(within(summary).getByText('R$ 18.000,00')).toBeInTheDocument();
  });

  /**
   * UC-2.3 — the critical interaction: one bill carrying a change from a
   * cycle onward, rather than two bills or twelve manual edits.
   */
  it('asks whether an amount change is for one cycle or every cycle from here on', async () => {
    stubApi({
      '/api/settings/anchor': anchor,
      '/api/templates': withTemplates([template()]),
    });
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Edit Health Plan' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Change amount' }),
    );

    expect(
      screen.getByRole('radio', { name: /This cycle only/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /This cycle and all future/ }),
    ).toBeInTheDocument();
  });

  it('offers to add income, a fixed bill and a variable bill', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Add income' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add a fixed bill' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add a variable bill' }),
    ).toBeInTheDocument();
  });

  // UC-5.8 — the figure the spreadsheet could not produce.
  it('shows each card with its open invoice and what is committed to future ones', async () => {
    stubApi({
      '/api/settings/anchor': anchor,
      '/api/cards': [card({ invoices: [invoice()] })],
    });
    renderPage();

    const cards = await screen.findByRole('region', { name: 'Credit cards' });

    expect(within(cards).getByText('Inter')).toBeInTheDocument();
    expect(within(cards).getByText('Limit')).toBeInTheDocument();
    expect(within(cards).getByText('Open invoice')).toBeInTheDocument();
    expect(within(cards).getByText('Committed')).toBeInTheDocument();
    expect(within(cards).getByText('Available')).toBeInTheDocument();
    expect(within(cards).getByText('R$ 2.400,00')).toBeInTheDocument();
  });

  /**
   * UC-1.3 — the closing/due day pair is what decides which cycle a purchase
   * is paid from, and it is the app's one counter-intuitive rule.
   */
  it("spells out which cycle a card's purchases will be paid in", async () => {
    stubApi({
      '/api/settings/anchor': anchor,
      '/api/cards': [card({ invoices: [invoice()] })],
    });
    renderPage();

    expect(
      await screen.findByText(
        'Purchases from 29 Jul to 28 Aug will be billed on the invoice due 10 Sep — the October 2026 cycle.',
      ),
    ).toBeInTheDocument();
  });

  // Nothing has been bought yet, so there is no invoice to name dates from.
  it('states the day pair in plain language before a card has an invoice', async () => {
    stubApi({
      '/api/settings/anchor': anchor,
      '/api/cards': [card()],
    });
    renderPage();

    expect(
      await screen.findByText(
        /Purchases up to day 28 are billed on the invoice due day 10 of the following month/,
      ),
    ).toBeInTheDocument();
  });

  it('offers to configure a card once there is an account to pay it from', async () => {
    stubApi({
      '/api/settings/anchor': anchor,
      '/api/accounts': {
        accounts: [
          { id: 'a1', name: 'Inter', type: 'CHECKING', balance: 166_000 },
        ],
        total: 166_000,
      },
    });
    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Add a card' }),
    ).toBeInTheDocument();
  });

  // An invoice is settled from an account, so there is nothing to configure
  // until one exists.
  it('asks for an account before a card can be added', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(await screen.findByText(/Add an account first/)).toBeInTheDocument();
  });

  // UC-1.5 — the checklist is the conversation's own sections, still outstanding.
  it('shows the setup checklist in the order the conversation asks', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    const setup = await screen.findByRole('region', { name: 'Setup' });

    expect(
      within(setup)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      '1The payday cyclenot set yet',
      '2Accounts0 accounts',
      '3Salary0 recorded',
      '4Fixed bills0 recorded',
      '5Variable bills0 recorded',
      '6Credit cards0 cards',
      '7Savings buckets0 buckets',
    ]);
  });

  /**
   * The anchor reads back a default whether or not anyone chose it, so the
   * checklist used to claim step one was done on a completely empty app.
   */
  it('leaves the anchor step outstanding until it has been configured', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(await screen.findByText('not set yet')).toBeInTheDocument();
  });

  it('marks the anchor step done once it has been configured', async () => {
    stubApi({
      '/api/settings/anchor': anchor,
      '/api/setup': { ...pristine, anchorConfigured: true },
    });
    renderPage();

    expect(await screen.findByText('configured')).toBeInTheDocument();
  });

  // The buckets are the one step this screen does not itself carry.
  it('links the buckets step to where the buckets live', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(
      await screen.findByRole('link', { name: 'Savings buckets' }),
    ).toHaveAttribute('href', '/savings');
  });

  it('offers to run the setup again whatever the setup state', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(
      await screen.findByRole('link', { name: 'Run setup again' }),
    ).toHaveAttribute('href', '/onboarding');
  });

  it('states the formatting conventions explicitly', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(await screen.findByText('R$ 1.234,56')).toBeInTheDocument();
    expect(screen.getByText('dd/MM/yyyy')).toBeInTheDocument();
    expect(screen.getByText('August 2026 (5 Aug – 3 Sep)')).toBeInTheDocument();
  });

  // UC-1.6 — nothing else takes snapshots, so this is the only way back.
  it('offers the export and the import, and says why they matter', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Export' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
    expect(
      screen.getByText(/the only way back from a mistake/),
    ).toBeInTheDocument();
  });
});
