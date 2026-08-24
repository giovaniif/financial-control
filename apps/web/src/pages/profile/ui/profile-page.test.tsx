import type { TemplateResponse } from '@fin/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, stubApi } from '@/shared/testing';

import { ProfilePage } from './profile-page.js';

const anchor = { anchorDay: 5, shiftPolicy: 'PRECEDING' };

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

const withTemplates = (templates: TemplateResponse[]) => ({ templates });

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
   * order: the anchor, then the accounts, then salary and bills.
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
      'Salário',
      'Contas a pagar',
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
  /**
   * The four commitment tiles were removed: they totalled the list directly
   * beneath them, which the list already shows bill by bill, and the one
   * figure they added — what ends within twelve cycles — read "nada se
   * encerra" for anyone with no end dates set, which is everyone by default.
   */
  it('leaves the bills to speak for themselves, with no tiles above them', async () => {
    stubApi({
      '/api/settings/anchor': anchor,
      '/api/templates': withTemplates([salary, template(), electricity]),
    });
    renderPage();

    await screen.findByRole('region', { name: 'Contas a pagar' });

    expect(
      screen.queryByRole('region', { name: 'Compromissos por ciclo' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Compromisso fixo')).not.toBeInTheDocument();
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

  /**
   * The checklist that used to carry this is gone: it restated, as six rows
   * of counts, what the sections above it already show — and none of it was
   * outstanding work the screen could not simply display. Re-running the
   * conversation is the one thing it offered that nothing else does, so it
   * stays, on its own.
   */
  it('offers to run the setup again, without a checklist around it', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    expect(
      await screen.findByRole('link', { name: 'Refazer a configuração' }),
    ).toHaveAttribute('href', '/onboarding');
    expect(
      screen.queryByRole('region', { name: 'Configuração' }),
    ).not.toBeInTheDocument();
  });

  /**
   * The formatting card is gone. It stated conventions the screen it sat on
   * demonstrates on every row — the amounts above it are already `R$ 1.234,56`
   * and already red when they are negative — so it taught by telling what the
   * app was showing anyway.
   */
  it('demonstrates its formatting rather than tabulating it', async () => {
    stubApi({ '/api/settings/anchor': anchor });
    renderPage();

    await screen.findByRole('region', { name: 'Backup' });

    expect(
      screen.queryByRole('region', { name: 'Formatação' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('dd/MM/yyyy')).not.toBeInTheDocument();
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
