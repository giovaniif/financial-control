import type { AccountResponse } from '@fin/contracts';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/shared/testing';

import { ManageAccounts } from './manage-accounts.js';

const inter: AccountResponse = {
  id: 'a1',
  name: 'Inter',
  type: 'CHECKING',
  balance: 200_000,
};

function stubWrite() {
  const fetchMock = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function lastCall(fetchMock: ReturnType<typeof stubWrite>) {
  const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
  const call = calls[calls.length - 1];

  return {
    url: call?.[0] ?? '',
    method: call?.[1].method ?? '',
    body: JSON.parse((call?.[1].body ?? '{}') as string) as Record<
      string,
      unknown
    >,
  };
}

const render = (accounts: AccountResponse[] = [inter]) =>
  renderWithProviders(<ManageAccounts accounts={accounts} />);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ManageAccounts', () => {
  it('opens an account with a name, type and starting balance', async () => {
    const fetchMock = stubWrite();
    render([]);

    await userEvent.click(
      screen.getByRole('button', { name: 'Adicionar conta' }),
    );
    await userEvent.type(screen.getByLabelText('Nome'), 'Nubank');
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Poupança');
    await userEvent.type(screen.getByLabelText('Saldo'), '1.500,00');
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() => {
      expect(lastCall(fetchMock)).toMatchObject({
        url: '/api/accounts',
        method: 'POST',
        body: { name: 'Nubank', type: 'SAVINGS', balance: 150_000 },
      });
    });
  });

  // UC-1.2 — balances can be corrected manually at any time.
  it('corrects a balance', async () => {
    const fetchMock = stubWrite();
    render();

    await userEvent.click(screen.getByRole('button', { name: 'Editar Inter' }));
    await userEvent.clear(screen.getByLabelText('Saldo'));
    await userEvent.type(screen.getByLabelText('Saldo'), '2.160,00');
    await userEvent.click(
      screen.getByRole('button', { name: 'Corrigir o saldo' }),
    );

    await waitFor(() => {
      expect(lastCall(fetchMock)).toMatchObject({
        url: '/api/accounts/a1/balance',
        method: 'PATCH',
        body: { balance: 216_000 },
      });
    });
  });

  it('renames an account', async () => {
    const fetchMock = stubWrite();
    render();

    await userEvent.click(screen.getByRole('button', { name: 'Editar Inter' }));
    await userEvent.clear(screen.getByLabelText('Nome'));
    await userEvent.type(screen.getByLabelText('Nome'), 'Inter Checking');
    await userEvent.click(screen.getByRole('button', { name: 'Renomear' }));

    await waitFor(() => {
      expect(lastCall(fetchMock)).toMatchObject({
        url: '/api/accounts/a1/name',
        method: 'PATCH',
        body: { name: 'Inter Checking' },
      });
    });
  });

  it('removes an account', async () => {
    const fetchMock = stubWrite();
    render();

    await userEvent.click(screen.getByRole('button', { name: 'Editar Inter' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remover' }));

    await waitFor(() => {
      expect(lastCall(fetchMock)).toMatchObject({
        url: '/api/accounts/a1',
        method: 'DELETE',
      });
    });
  });

  it('refuses a balance it cannot read', async () => {
    const fetchMock = stubWrite();
    render([]);

    await userEvent.click(
      screen.getByRole('button', { name: 'Adicionar conta' }),
    );
    await userEvent.type(screen.getByLabelText('Nome'), 'Cash');
    await userEvent.type(screen.getByLabelText('Saldo'), 'some');
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Digite um valor como 1.234,56',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
