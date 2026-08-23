import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/shared/testing';

import { CorrectBalance } from './correct-balance.js';

function stubPost() {
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

function bodyOf(fetchMock: ReturnType<typeof stubPost>) {
  const call = fetchMock.mock.calls[0] as unknown as
    | [string, RequestInit]
    | undefined;

  return JSON.parse((call?.[1].body ?? '{}') as string) as Record<
    string,
    unknown
  >;
}

const render = () =>
  renderWithProviders(
    <CorrectBalance bucketId="b1" bucketName="Reserve" balance={216_000} />,
  );

const open = () =>
  userEvent.click(
    screen.getByRole('button', { name: 'Corrigir o saldo de Reserve' }),
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * UC-6.7 — the balance is a fold over an append-only log, so "editing" it is
 * recording what was actually observed. Reaching that through a generic
 * event form meant the one thing a user asks for by name — *the balance is
 * wrong* — was the third option in a list.
 */
describe('CorrectBalance', () => {
  it('opens on the balance the bucket currently holds', async () => {
    stubPost();
    render();

    await open();

    expect(screen.getByLabelText('Saldo observado')).toHaveValue('2.160,00');
  });

  it('records the observed balance with its reason', async () => {
    const fetchMock = stubPost();
    render();

    await open();
    await userEvent.clear(screen.getByLabelText('Saldo observado'));
    await userEvent.type(screen.getByLabelText('Saldo observado'), '3.000,00');
    await userEvent.type(
      screen.getByLabelText('Motivo'),
      'extrato do banco em 23/08',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Corrigir' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(bodyOf(fetchMock)).toMatchObject({
      kind: 'CORRECTION',
      amount: 300_000,
      reason: 'extrato do banco em 23/08',
    });
  });

  /**
   * The reason is a domain invariant, not a form nicety: a balance that moved
   * with no trace of why is the specific spreadsheet failure UC-6.7 exists to
   * prevent. The dialog refuses before the request rather than after it.
   */
  it('refuses to correct a balance with no reason given', async () => {
    const fetchMock = stubPost();
    render();

    await open();
    await userEvent.clear(screen.getByLabelText('Saldo observado'));
    await userEvent.type(screen.getByLabelText('Saldo observado'), '3.000,00');
    await userEvent.click(screen.getByRole('button', { name: 'Corrigir' }));

    expect(
      screen.getByText('Diga por que o saldo está sendo corrigido.'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses an amount it cannot read as money', async () => {
    const fetchMock = stubPost();
    render();

    await open();
    await userEvent.clear(screen.getByLabelText('Saldo observado'));
    await userEvent.type(screen.getByLabelText('Saldo observado'), 'três mil');
    await userEvent.type(screen.getByLabelText('Motivo'), 'extrato');
    await userEvent.click(screen.getByRole('button', { name: 'Corrigir' }));

    expect(
      screen.getByText('Informe um valor como 1.234,56.'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
