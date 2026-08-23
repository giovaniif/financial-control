import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/shared/testing';

import { CreateTemplateButton } from './create-template-button.js';

function stubPost() {
  const fetchMock = vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify({}), { status: 201 })),
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

const open = (name = 'Adicionar conta a pagar') =>
  userEvent.click(screen.getByRole('button', { name }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CreateTemplateButton', () => {
  it('creates a recurring outcome from a name, amount and due day', async () => {
    const fetchMock = stubPost();
    renderWithProviders(<CreateTemplateButton currentMonth="2026-08" />);

    await open();
    await userEvent.type(screen.getByLabelText('Nome'), 'Health Plan');
    await userEvent.type(screen.getByLabelText('Valor'), '320');
    await userEvent.clear(screen.getByLabelText('Dia de vencimento'));
    await userEvent.type(screen.getByLabelText('Dia de vencimento'), '8');
    await userEvent.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/templates',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(bodyOf(fetchMock)).toMatchObject({
      name: 'Health Plan',
      direction: 'OUT',
      dueDayOfMonth: 8,
      amount: 32_000,
      startMonth: '2026-08',
    });
  });

  it('creates a recurring income', async () => {
    const fetchMock = stubPost();
    renderWithProviders(<CreateTemplateButton currentMonth="2026-08" />);

    await open();
    await userEvent.type(screen.getByLabelText('Nome'), 'Salary');
    await userEvent.type(screen.getByLabelText('Valor'), '18.000');
    await userEvent.selectOptions(screen.getByLabelText('Direção'), 'Entrada');
    await userEvent.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => {
      expect(bodyOf(fetchMock)).toMatchObject({
        direction: 'IN',
        amount: 1_800_000,
      });
    });
  });

  // UC-2.6 — a placeholder the user knows is only roughly right.
  it('can be flagged as an unconfirmed estimate at creation', async () => {
    const fetchMock = stubPost();
    renderWithProviders(<CreateTemplateButton currentMonth="2026-08" />);

    await open();
    await userEvent.type(screen.getByLabelText('Nome'), 'Contractor Costs');
    await userEvent.type(screen.getByLabelText('Valor'), '1.500');
    await userEvent.click(screen.getByLabelText('Estimativa não confirmada'));
    await userEvent.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => {
      expect(bodyOf(fetchMock)).toMatchObject({ isEstimate: true });
    });
  });

  /**
   * A screen that asks for income and for bills separately has already
   * answered the direction, so the form does not ask it again.
   */
  it('takes its wording and its direction from the caller', async () => {
    const fetchMock = stubPost();
    renderWithProviders(
      <CreateTemplateButton
        currentMonth="2026-08"
        label="Adicionar receita"
        direction="IN"
      />,
    );

    await open('Adicionar receita');
    expect(screen.queryByLabelText('Direção')).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Nome'), 'Salary');
    await userEvent.type(screen.getByLabelText('Valor'), '18.000');
    await userEvent.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => {
      expect(bodyOf(fetchMock)).toMatchObject({
        direction: 'IN',
        amount: 1_800_000,
      });
    });
  });

  /**
   * A bill whose amount moves is not a different kind of bill — it is this
   * one flag, on the one form, so nothing has to be filed elsewhere.
   */
  it('records a bill as an estimate when the flag is ticked', async () => {
    const fetchMock = stubPost();
    renderWithProviders(
      <CreateTemplateButton
        currentMonth="2026-08"
        label="Adicionar conta a pagar"
        direction="OUT"
      />,
    );

    await open('Adicionar conta a pagar');
    await userEvent.type(screen.getByLabelText('Nome'), 'Electricity');
    await userEvent.type(screen.getByLabelText('Valor'), '280');
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Estimativa não confirmada' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => {
      expect(bodyOf(fetchMock)).toMatchObject({ isEstimate: true });
    });
  });

  // The default is the confirmed one: a guess is something the user says.
  it('records a bill as confirmed unless the flag is ticked', async () => {
    const fetchMock = stubPost();
    renderWithProviders(
      <CreateTemplateButton currentMonth="2026-08" direction="OUT" />,
    );

    await open();
    await userEvent.type(screen.getByLabelText('Nome'), 'Rent');
    await userEvent.type(screen.getByLabelText('Valor'), '2.500');
    await userEvent.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => {
      expect(bodyOf(fetchMock)).toMatchObject({ isEstimate: false });
    });
  });

  it('refuses a due day outside a month', async () => {
    const fetchMock = stubPost();
    renderWithProviders(<CreateTemplateButton currentMonth="2026-08" />);

    await open();
    await userEvent.type(screen.getByLabelText('Nome'), 'Rent');
    await userEvent.type(screen.getByLabelText('Valor'), '100');
    await userEvent.clear(screen.getByLabelText('Dia de vencimento'));
    await userEvent.type(screen.getByLabelText('Dia de vencimento'), '45');
    await userEvent.click(screen.getByRole('button', { name: 'Criar' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Um dia entre 1 e 31');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses an unnamed item', async () => {
    const fetchMock = stubPost();
    renderWithProviders(<CreateTemplateButton currentMonth="2026-08" />);

    await open();
    await userEvent.type(screen.getByLabelText('Valor'), '100');
    await userEvent.click(screen.getByRole('button', { name: 'Criar' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Informe um nome');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
