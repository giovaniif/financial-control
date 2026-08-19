import type {
  CardResponse,
  InvoiceResponse,
  TemplateResponse,
} from '@fin/contracts';
import { screen, waitFor, within } from '@testing-library/react';
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

const internet = template({
  id: 'internet',
  name: 'Internet',
  amount: -12_000,
  dueDayOfMonth: 20,
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

const billRows = () =>
  within(region('Contas a pagar')).getAllByRole('row').slice(1);

const positionOf = (name: string) =>
  billRows().findIndex((row) => within(row).queryByText(name) !== null);

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
    await screen.findByText(/O salário cai no dia/);

    expect(
      screen
        .getAllByRole('region')
        .map((section) => section.getAttribute('aria-label')),
    ).toEqual([
      'Dia do pagamento',
      'Contas',
      'Compromissos por ciclo',
      'Salário',
      'Contas a pagar',
      'Cartões de crédito',
      'Configuração',
      'Formatação',
      'Backup',
    ]);
  });

  it('states the payday anchor in plain language', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(await screen.findByText(/O salário cai no dia/)).toBeInTheDocument();
    expect(screen.getByText(/dia útil anterior/)).toBeInTheDocument();
  });

  // Changing it re-slices every open cycle, so it is never silent.
  it('warns that changing the anchor re-slices open cycles', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(
      await screen.findByText(/Os ciclos fechados nunca são alterados/),
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
            currentRange: '5 ago – 3 set',
            proposedRange: '7 ago – 6 set',
            entriesLeaving: 3,
          },
        ],
        totalEntriesMoving: 3,
        orphanedEntries: 0,
      },
    });
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Alterar o dia do pagamento',
      }),
    );
    expect(
      screen.getByRole('button', { name: 'Aplicar a mudança' }),
    ).toBeDisabled();

    await userEvent.click(
      screen.getByRole('button', { name: 'Pré-visualizar' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '3 lançamentos mudariam de ciclo',
    );
    expect(
      screen.getByRole('button', { name: 'Aplicar a mudança' }),
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

    const accounts = await screen.findByRole('region', { name: 'Contas' });

    expect(await within(accounts).findByText('corrente')).toBeInTheDocument();
    // The balance on its row, and again as the total they add up to.
    expect(within(accounts).getAllByText('R$ 1.660,00')).toHaveLength(2);
    expect(within(accounts).getByText('Nas contas agora')).toBeInTheDocument();
  });

  it('offers to add an account when there are none', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Adicionar conta' }),
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

  /**
   * The salary is income, not a bill, so it keeps its own section. Everything
   * that goes out is one list — a bill whose amount is a guess is still a
   * bill, and `isEstimate` already says which ones those are.
   */
  it('keeps the salary apart and carries every bill in one list', async () => {
    stubApi({
      '/api/settings/anchor': anchor,
      '/api/templates': withTemplates([salary, template(), electricity]),
    });
    renderPage();
    await screen.findByText('Health Plan');

    expect(
      within(region('Salário')).getByRole('button', {
        name: 'Editar Salary',
      }),
    ).toBeInTheDocument();
    expect(
      within(region('Contas a pagar')).getByText('Health Plan'),
    ).toBeInTheDocument();
    expect(
      within(region('Contas a pagar')).getByText('Electricity'),
    ).toBeInTheDocument();
    expect(
      within(region('Contas a pagar')).getByText('dia 8'),
    ).toBeInTheDocument();
    expect(within(region('Salário')).queryByText('Health Plan')).toBeNull();
  });

  // The order is the order the money leaves, so a cycle reads front to back.
  it('lists the bills in due-day order', async () => {
    stubApi({
      '/api/settings/anchor': anchor,
      '/api/templates': withTemplates([internet, electricity, template()]),
    });
    renderPage();
    await screen.findByText('Health Plan');

    expect(['Health Plan', 'Electricity', 'Internet'].map(positionOf)).toEqual([
      0, 1, 2,
    ]);
  });

  /**
   * FIN-121 — the two lists were computed from `isEstimate`, so confirming an
   * amount made the bill vanish from one and reappear in the other. The tag
   * changes; the row stays exactly where it was.
   */
  it('leaves a bill where it is when its amount is confirmed', async () => {
    let confirmed = false;
    stubApi({
      '/api/settings/anchor': anchor,
      '/api/templates': () =>
        withTemplates([
          template(),
          confirmed ? { ...electricity, isEstimate: false } : electricity,
          internet,
        ]),
      '/api/templates/electricity': () => {
        confirmed = true;
        return { ...electricity, isEstimate: false };
      },
    });
    renderPage();
    await screen.findByText('Electricity');

    const before = positionOf('Electricity');
    expect(
      within(region('Contas a pagar')).getByText('~estimativa'),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Editar Electricity' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirmar o valor' }),
    );

    await waitFor(() => {
      expect(
        within(region('Contas a pagar')).queryByText('~estimativa'),
      ).toBeNull();
    });
    expect(positionOf('Electricity')).toBe(before);
  });

  // UC-2.6 — a guess must never read as a known bill.
  it('tags a bill whose amount is unconfirmed', async () => {
    stubApi({
      '/api/settings/anchor': anchor,
      '/api/templates': withTemplates([template(), electricity]),
    });
    renderPage();
    await screen.findByText('Electricity');

    const bills = region('Contas a pagar');

    expect(within(bills).getAllByText('~estimativa')).toHaveLength(1);
    expect(
      within(bills).getByRole('row', { name: /Electricity/ }),
    ).toHaveTextContent('~estimativa');
  });

  // UC-2.7 — the four figures that summarise what the user is committed to.
  it('summarises what every cycle is already committed to', async () => {
    stubApi({
      '/api/settings/anchor': anchor,
      '/api/templates': withTemplates([salary, template(), electricity]),
    });
    renderPage();

    const summary = await screen.findByRole('region', {
      name: 'Compromissos por ciclo',
    });

    expect(within(summary).getByText('Compromisso fixo')).toBeInTheDocument();
    expect(within(summary).getByText('Receita fixa')).toBeInTheDocument();
    expect(
      within(summary).getByText('Estimativas não confirmadas'),
    ).toBeInTheDocument();
    expect(
      within(summary).getByText('Encerrando em 12 ciclos'),
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
      await screen.findByRole('button', { name: 'Editar Health Plan' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Alterar valor' }),
    );

    expect(
      screen.getByRole('radio', { name: /Só neste ciclo/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /Neste ciclo e nos futuros/ }),
    ).toBeInTheDocument();
  });

  /**
   * One button, and the estimate is a flag on the form — two buttons made a
   * guessed amount look like a different kind of bill.
   */
  it('offers to add income and a bill, with the estimate as a flag', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Adicionar receita' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /conta variável/i }),
    ).toBeNull();

    await userEvent.click(
      screen.getByRole('button', { name: 'Adicionar conta a pagar' }),
    );

    expect(
      screen.getByRole('checkbox', { name: 'Estimativa não confirmada' }),
    ).not.toBeChecked();
  });

  // UC-5.8 — the figure the spreadsheet could not produce.
  it('shows each card with its open invoice and what is committed to future ones', async () => {
    stubApi({
      '/api/settings/anchor': anchor,
      '/api/cards': [card({ invoices: [invoice()] })],
    });
    renderPage();

    const cards = await screen.findByRole('region', {
      name: 'Cartões de crédito',
    });

    expect(within(cards).getByText('Inter')).toBeInTheDocument();
    expect(within(cards).getByText('Limite')).toBeInTheDocument();
    expect(within(cards).getByText('Fatura aberta')).toBeInTheDocument();
    expect(within(cards).getByText('Comprometido')).toBeInTheDocument();
    expect(within(cards).getByText('Disponível')).toBeInTheDocument();
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
        'As compras de 29 jul a 28 ago entram na fatura com vencimento em 10 set — ciclo Outubro de 2026.',
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
        /As compras feitas até o dia 28 entram na fatura com vencimento no dia 10 do mês seguinte/,
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
      await screen.findByRole('button', { name: 'Adicionar cartão' }),
    ).toBeInTheDocument();
  });

  // An invoice is settled from an account, so there is nothing to configure
  // until one exists.
  it('asks for an account before a card can be added', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(
      await screen.findByText(/Adicione uma conta primeiro/),
    ).toBeInTheDocument();
  });

  // UC-1.5 — the checklist is the conversation's own sections, still outstanding.
  it('shows the setup checklist in the order the conversation asks', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    const setup = await screen.findByRole('region', { name: 'Configuração' });

    expect(
      within(setup)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      '1O ciclo de pagamentoainda não definido',
      '2Contas0 contas',
      '3Salário0 registrados',
      '4Contas fixas0 registrados',
      '5Contas variáveis0 registrados',
      '6Cartões de crédito0 cartões',
      '7Caixinhas0 caixinhas',
    ]);
  });

  /**
   * The anchor reads back a default whether or not anyone chose it, so the
   * checklist used to claim step one was done on a completely empty app.
   */
  it('leaves the anchor step outstanding until it has been configured', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(await screen.findByText('ainda não definido')).toBeInTheDocument();
  });

  it('marks the anchor step done once it has been configured', async () => {
    stubApi({
      '/api/settings/anchor': anchor,
      '/api/setup': { ...pristine, anchorConfigured: true },
    });
    renderPage();

    expect(await screen.findByText('configurado')).toBeInTheDocument();
  });

  // The buckets are the one step this screen does not itself carry.
  it('links the buckets step to where the buckets live', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(
      await screen.findByRole('link', { name: 'Caixinhas' }),
    ).toHaveAttribute('href', '/savings');
  });

  it('offers to run the setup again whatever the setup state', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(
      await screen.findByRole('link', {
        name: 'Executar a configuração novamente',
      }),
    ).toHaveAttribute('href', '/onboarding');
  });

  it('states the formatting conventions explicitly', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(await screen.findByText('R$ 1.234,56')).toBeInTheDocument();
    expect(screen.getByText('dd/MM/yyyy')).toBeInTheDocument();
    expect(
      screen.getByText('Agosto de 2026 (5 ago – 3 set)'),
    ).toBeInTheDocument();
  });

  // UC-1.6 — nothing else takes snapshots, so this is the only way back.
  it('offers the export and the import, and says why they matter', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Exportar' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Importar' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/único jeito de voltar atrás de um erro/),
    ).toBeInTheDocument();
  });
});
