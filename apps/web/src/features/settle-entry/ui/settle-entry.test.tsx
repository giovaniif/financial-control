import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/shared/testing';

import { SettleEntry, SettleWithAmount, SkipEntry } from './settle-entry.js';

function stubSettle() {
  const fetchMock = vi.fn(() =>
    Promise.resolve(new Response(null, { status: 204 })),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function bodyOf(fetchMock: ReturnType<typeof stubSettle>) {
  const call = fetchMock.mock.calls[0] as unknown as
    [string, RequestInit] | undefined;

  return JSON.parse((call?.[1].body ?? '{}') as string) as Record<
    string,
    unknown
  >;
}

const renderEntry = (planned = -32_000, isEstimate = false) =>
  renderWithProviders(
    <SettleEntry
      month="2026-08"
      entryId="e1"
      planned={planned}
      isEstimate={isEstimate}
    />,
  );

/** The menu item, which is where settling at another amount now lives. */
const renderWithAmount = (planned = -32_000) =>
  renderWithProviders(
    <SettleWithAmount month="2026-08" entryId="e1" planned={planned} />,
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SettleEntry', () => {
  // One click when the actual equals the planned amount. This is the most
  // repeated action in the app, so it must not become two.
  it('settles at the planned amount in one click', async () => {
    const fetchMock = stubSettle();
    renderEntry();

    await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));

    await waitFor(() => {
      expect(bodyOf(fetchMock)).toEqual({ status: 'PAID' });
    });
  });

  it('confirms money coming in rather than settling it', async () => {
    const fetchMock = stubSettle();
    renderEntry(1_800_000);

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => {
      expect(bodyOf(fetchMock)).toEqual({ status: 'RECEIVED' });
    });
  });

  it('settles at a different actual in two', async () => {
    const fetchMock = stubSettle();
    renderWithAmount();

    await userEvent.click(
      screen.getByRole('button', { name: 'Pagar com outro valor' }),
    );
    await userEvent.clear(screen.getByLabelText('Valor realizado'));
    await userEvent.type(screen.getByLabelText('Valor realizado'), '345,90');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(bodyOf(fetchMock)).toEqual({ status: 'PAID', actual: -34_590 });
    });
  });

  it('opens prefilled with the planned amount, since it usually matches', async () => {
    stubSettle();
    renderWithAmount();

    await userEvent.click(
      screen.getByRole('button', { name: 'Pagar com outro valor' }),
    );

    expect(screen.getByLabelText('Valor realizado')).toHaveValue('320,00');
  });

  /**
   * A plan that never happened is not the same as one paid at zero — and it
   * needs no amount, so it no longer lives behind a form that asks for one.
   */
  it('skips an entry that never happened, without a form', async () => {
    const fetchMock = stubSettle();
    renderWithProviders(
      <SkipEntry month="2026-08" entryId="e1" description="Claro" />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Ignorar Claro neste mês' }),
    );

    await waitFor(() => {
      expect(bodyOf(fetchMock)).toEqual({ status: 'SKIPPED' });
    });
  });

  /**
   * The field is masked, so unreadable text never reaches it — typing words
   * leaves it empty rather than leaving something to reject. What is left to
   * refuse is nothing at all.
   */
  it('keeps anything that is not a figure out of the field', async () => {
    stubSettle();
    renderWithAmount();

    await userEvent.click(
      screen.getByRole('button', { name: 'Pagar com outro valor' }),
    );
    await userEvent.clear(screen.getByLabelText('Valor realizado'));
    await userEvent.type(screen.getByLabelText('Valor realizado'), 'about');

    expect(screen.getByLabelText('Valor realizado')).toHaveValue('');
  });

  it('refuses an empty amount rather than settling at nothing', async () => {
    const fetchMock = stubSettle();
    renderWithAmount();

    await userEvent.click(
      screen.getByRole('button', { name: 'Pagar com outro valor' }),
    );
    await userEvent.clear(screen.getByLabelText('Valor realizado'));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Digite um valor como 1.234,56',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /**
   * UC-2.6 — `~estimativa` says nobody has confirmed the figure. Settling one
   * in a click would record the guess as a fact and the tag would stop
   * meaning anything, so it asks.
   */
  it('asks what an estimate actually cost instead of settling it', async () => {
    const fetchMock = stubSettle();
    renderEntry(-32_000, true);

    await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));

    expect(screen.getByLabelText('Valor realizado')).toHaveValue('320,00');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still settles a confirmed bill in one click', async () => {
    const fetchMock = stubSettle();
    renderEntry(-32_000, false);

    await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));

    await waitFor(() => {
      expect(bodyOf(fetchMock)).toEqual({ status: 'PAID' });
    });
    expect(screen.queryByLabelText('Valor realizado')).not.toBeInTheDocument();
  });
});
