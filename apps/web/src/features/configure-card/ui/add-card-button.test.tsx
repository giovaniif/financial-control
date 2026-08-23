import type { AccountResponse } from '@fin/contracts';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/shared/testing';

import { AddCardButton } from './add-card-button.js';

const accounts: AccountResponse[] = [
  { id: 'acc-1', name: 'Inter Checking', type: 'CHECKING', balance: 200_000 },
];

function stubPost() {
  const fetchMock = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify({}), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function bodyOf(fetchMock: ReturnType<typeof stubPost>) {
  const call = fetchMock.mock.calls[0] as unknown as
    [string, RequestInit] | undefined;

  return JSON.parse((call?.[1].body ?? '{}') as string) as Record<
    string,
    unknown
  >;
}

const render = () => renderWithProviders(<AddCardButton accounts={accounts} />);

const open = () =>
  userEvent.click(screen.getByRole('button', { name: 'Adicionar cartão' }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AddCardButton', () => {
  it('opens a card with its limit, day pair and paying account', async () => {
    const fetchMock = stubPost();
    render();

    await open();
    await userEvent.type(screen.getByLabelText('Nome'), 'Inter');
    await userEvent.type(screen.getByLabelText('Limite'), '10.000');
    await userEvent.clear(screen.getByLabelText('Dia de fechamento'));
    await userEvent.type(screen.getByLabelText('Dia de fechamento'), '28');
    await userEvent.clear(screen.getByLabelText('Dia de vencimento'));
    await userEvent.type(screen.getByLabelText('Dia de vencimento'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/cards',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(bodyOf(fetchMock)).toEqual({
      name: 'Inter',
      limit: 1_000_000,
      closingDay: 28,
      dueDay: 10,
      paymentAccountId: 'acc-1',
    });
  });

  /**
   * UC-1.3 — the day pair drives everything downstream, so the form says in
   * plain language what it means before the card exists.
   */
  it('previews what the day pair means', async () => {
    stubPost();
    render();

    await open();
    await userEvent.clear(screen.getByLabelText('Dia de fechamento'));
    await userEvent.type(screen.getByLabelText('Dia de fechamento'), '28');
    await userEvent.clear(screen.getByLabelText('Dia de vencimento'));
    await userEvent.type(screen.getByLabelText('Dia de vencimento'), '10');

    expect(
      screen.getByText(
        /As compras feitas até o dia 28 entram na fatura com vencimento no dia 10 do mês seguinte/,
      ),
    ).toBeInTheDocument();
  });

  it('refuses a day outside a month', async () => {
    const fetchMock = stubPost();
    render();

    await open();
    await userEvent.type(screen.getByLabelText('Nome'), 'Inter');
    await userEvent.type(screen.getByLabelText('Limite'), '100');
    await userEvent.clear(screen.getByLabelText('Dia de fechamento'));
    await userEvent.type(screen.getByLabelText('Dia de fechamento'), '40');
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Um dia entre 1 e 31');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The invoice is paid from an account; without one there is nothing to pay it.
  it('says an account is needed before a card can be added', () => {
    stubPost();
    renderWithProviders(<AddCardButton accounts={[]} />);

    expect(
      screen.getByText(
        'Adicione uma conta primeiro — uma fatura é paga a partir de uma conta.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Adicionar cartão' }),
    ).not.toBeInTheDocument();
  });
});
