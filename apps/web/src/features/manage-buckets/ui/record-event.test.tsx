import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/shared/testing';

import { RecordEvent } from './record-event.js';

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
    [string, RequestInit] | undefined;

  return JSON.parse((call?.[1].body ?? '{}') as string) as Record<
    string,
    unknown
  >;
}

const render = () =>
  renderWithProviders(
    <RecordEvent bucketId="b1" bucketName="Reserve" month="2026-08" />,
  );

const open = () =>
  userEvent.click(screen.getByRole('button', { name: 'Registrar em Reserve' }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RecordEvent', () => {
  // UC-6.5 — the rule is a default, not a constraint.
  it('overrides this cycle without changing the rule', async () => {
    const fetchMock = stubPost();
    render();

    await open();
    await userEvent.type(screen.getByLabelText('Valor'), '100,00');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/buckets/b1/events',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(bodyOf(fetchMock)).toEqual({
      kind: 'OVERRIDE',
      amount: 10_000,
      month: '2026-08',
    });
  });

  // Growth from returns, never confused with growth from saving.
  it('records a yield against a date', async () => {
    const fetchMock = stubPost();
    render();

    await open();
    await userEvent.selectOptions(
      screen.getByLabelText('O que aconteceu'),
      'Rendimento',
    );
    await userEvent.type(screen.getByLabelText('Valor'), '45,80');
    await userEvent.clear(screen.getByLabelText('Data'));
    await userEvent.type(screen.getByLabelText('Data'), '2026-08-31');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => {
      expect(bodyOf(fetchMock)).toEqual({
        kind: 'YIELD',
        amount: 4_580,
        date: '2026-08-31',
      });
    });
  });

  /**
   * The spreadsheet hard-coded balances over its own running total whenever
   * reality drifted, leaving no trace of why. A correction carries its reason.
   */
  it('will not correct a balance without a reason', async () => {
    const fetchMock = stubPost();
    render();

    await open();
    await userEvent.selectOptions(
      screen.getByLabelText('O que aconteceu'),
      'Correção',
    );
    await userEvent.type(screen.getByLabelText('Valor'), '15.783,44');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Diga por que o saldo está sendo corrigido',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('records a correction with its reason', async () => {
    const fetchMock = stubPost();
    render();

    await open();
    await userEvent.selectOptions(
      screen.getByLabelText('O que aconteceu'),
      'Correção',
    );
    await userEvent.type(screen.getByLabelText('Valor'), '15.783,44');
    await userEvent.type(
      screen.getByLabelText('Motivo'),
      'Matched to the bank statement',
    );
    await userEvent.clear(screen.getByLabelText('Data'));
    await userEvent.type(screen.getByLabelText('Data'), '2026-08-31');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => {
      expect(bodyOf(fetchMock)).toEqual({
        kind: 'CORRECTION',
        amount: 1_578_344,
        date: '2026-08-31',
        reason: 'Matched to the bank statement',
      });
    });
  });

  it('will not withdraw without a reason either', async () => {
    const fetchMock = stubPost();
    render();

    await open();
    await userEvent.selectOptions(
      screen.getByLabelText('O que aconteceu'),
      'Resgate',
    );
    await userEvent.type(screen.getByLabelText('Valor'), '500,00');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Diga por que');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('records a withdrawal', async () => {
    const fetchMock = stubPost();
    render();

    await open();
    await userEvent.selectOptions(
      screen.getByLabelText('O que aconteceu'),
      'Resgate',
    );
    await userEvent.type(screen.getByLabelText('Valor'), '500,00');
    await userEvent.type(screen.getByLabelText('Motivo'), 'Notary fees');
    await userEvent.clear(screen.getByLabelText('Data'));
    await userEvent.type(screen.getByLabelText('Data'), '2026-08-20');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => {
      expect(bodyOf(fetchMock)).toMatchObject({
        kind: 'WITHDRAWAL',
        amount: 50_000,
        reason: 'Notary fees',
      });
    });
  });

  it('asks for no reason on an override or a yield', async () => {
    stubPost();
    render();

    await open();

    expect(screen.queryByLabelText('Motivo')).not.toBeInTheDocument();
  });
});
