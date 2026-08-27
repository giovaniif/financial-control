import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/shared/testing';

import { OverrideEntry } from './override-entry.js';
import { RevertOverride } from './revert-override.js';

function stubApi() {
  const fetchMock = vi.fn(() =>
    Promise.resolve(new Response(null, { status: 204 })),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

type Call = [string, RequestInit] | undefined;

const bodyOf = (fetchMock: ReturnType<typeof stubApi>) => {
  const call = fetchMock.mock.calls[0] as unknown as Call;

  return JSON.parse((call?.[1].body ?? '{}') as string) as Record<
    string,
    unknown
  >;
};

const render = () =>
  renderWithProviders(
    <OverrideEntry
      month="2026-09"
      entryId="e-salary"
      description="Salário"
      planned={3_500_000}
    />,
  );

const open = () =>
  userEvent.click(
    screen.getByRole('button', { name: 'Mudar o valor de Salário neste mês' }),
  );

const save = () =>
  userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OverrideEntry', () => {
  /**
   * The verb is the contract, not a detail: the route serves PUT and pairs it
   * with a DELETE that reverts. Sent as anything else the request 404s before
   * the interactor sees it, and the screen reports a failure that never
   * happened.
   */
  it('puts the new figure at the route that answers for it', async () => {
    const fetchMock = stubApi();
    render();

    await open();
    await userEvent.clear(screen.getByLabelText('Valor neste ciclo'));
    await userEvent.type(
      screen.getByLabelText('Valor neste ciclo'),
      '18000,00',
    );
    await save();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/cycles/2026-09/entries/e-salary/override',
        expect.objectContaining({ method: 'PUT' }),
      );
    });
    expect(bodyOf(fetchMock)).toEqual({ amount: 1_800_000 });
  });

  it('closes once the cycle has taken the new figure', async () => {
    stubApi();
    render();

    await open();
    await save();

    await waitFor(() => {
      expect(
        screen.queryByLabelText('Valor neste ciclo'),
      ).not.toBeInTheDocument();
    });
  });
});

describe('RevertOverride', () => {
  const renderRevert = () =>
    renderWithProviders(
      <RevertOverride
        month="2026-09"
        entryId="e-rent"
        description="Aluguel"
        projectedAmount={-761_000}
      />,
    );

  /**
   * UC-3.7 — the projected value goes back in one action. DELETE on the same
   * path that PUT sets it: asserted on the request so the verb cannot drift
   * the way it did in FIN-170.
   */
  it('deletes the override at the route that answers for it', async () => {
    const fetchMock = stubApi();
    renderRevert();

    await userEvent.click(
      screen.getByRole('button', {
        name: /Voltar Aluguel ao valor previsto/,
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/cycles/2026-09/entries/e-rent/override',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  /**
   * Without the figure the item asks for a change whose result cannot be
   * seen, which makes it two decisions instead of one.
   */
  it('names the amount it would put back', () => {
    stubApi();
    renderRevert();

    expect(
      screen.getByRole('button', { name: /-R\$\s*7\.610,00/ }),
    ).toBeInTheDocument();
  });
});
