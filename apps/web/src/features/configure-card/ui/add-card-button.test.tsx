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
  userEvent.click(screen.getByRole('button', { name: 'Add a card' }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AddCardButton', () => {
  it('opens a card with its limit, day pair and paying account', async () => {
    const fetchMock = stubPost();
    render();

    await open();
    await userEvent.type(screen.getByLabelText('Name'), 'Inter');
    await userEvent.type(screen.getByLabelText('Limit'), '10.000');
    await userEvent.clear(screen.getByLabelText('Closing day'));
    await userEvent.type(screen.getByLabelText('Closing day'), '28');
    await userEvent.clear(screen.getByLabelText('Due day'));
    await userEvent.type(screen.getByLabelText('Due day'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

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
    await userEvent.clear(screen.getByLabelText('Closing day'));
    await userEvent.type(screen.getByLabelText('Closing day'), '28');
    await userEvent.clear(screen.getByLabelText('Due day'));
    await userEvent.type(screen.getByLabelText('Due day'), '10');

    expect(
      screen.getByText(
        /Purchases up to day 28 are billed on the invoice due day 10 of the following month/,
      ),
    ).toBeInTheDocument();
  });

  it('refuses a day outside a month', async () => {
    const fetchMock = stubPost();
    render();

    await open();
    await userEvent.type(screen.getByLabelText('Name'), 'Inter');
    await userEvent.type(screen.getByLabelText('Limit'), '100');
    await userEvent.clear(screen.getByLabelText('Closing day'));
    await userEvent.type(screen.getByLabelText('Closing day'), '40');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'A day between 1 and 31',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The invoice is paid from an account; without one there is nothing to pay it.
  it('says an account is needed before a card can be added', () => {
    stubPost();
    renderWithProviders(<AddCardButton accounts={[]} />);

    expect(
      screen.getByText('Add an account first — an invoice is paid from one.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add a card' }),
    ).not.toBeInTheDocument();
  });
});
