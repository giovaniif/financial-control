import type { ReopenPreviewResponse } from '@fin/contracts';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, stubApi } from '@/shared/testing';

import { CloseCycle } from './close-cycle.js';

const preview: ReopenPreviewResponse = {
  month: '2026-06',
  shifts: [
    { month: '2026-07', currentOpening: 500_000, recomputedOpening: 420_000 },
    { month: '2026-08', currentOpening: 900_000, recomputedOpening: 820_000 },
  ],
};

function renderCycle(
  options: { status?: 'OPEN' | 'CLOSED'; unsettled?: number } = {},
) {
  return renderWithProviders(
    <CloseCycle
      month="2026-06"
      label="Junho de 2026"
      status={options.status ?? 'OPEN'}
      hasEnded
      unsettled={options.unsettled ?? 0}
    />,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CloseCycle', () => {
  it('offers to close a cycle whose end has passed', async () => {
    stubApi({});
    renderCycle();

    await userEvent.click(
      screen.getByRole('button', { name: 'Fechar o ciclo' }),
    );

    expect(
      screen.getByRole('dialog', { name: 'Fechar Junho de 2026' }),
    ).toBeInTheDocument();
  });

  it('is never offered for a cycle still running', () => {
    stubApi({});
    renderWithProviders(
      <CloseCycle
        month="2026-08"
        label="Agosto de 2026"
        status="OPEN"
        hasEnded={false}
        unsettled={0}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Fechar o ciclo' }),
    ).not.toBeInTheDocument();
  });

  // A cycle cannot close while anything is unsettled, so the form says how
  // many rather than letting the API answer with a 409.
  it('names what is blocking rather than just refusing', async () => {
    stubApi({});
    renderCycle({ unsettled: 3 });

    await userEvent.click(
      screen.getByRole('button', { name: 'Fechar o ciclo' }),
    );

    expect(
      screen.getByText(/3 lançamentos ainda estão sem baixa/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Fechar Junho de 2026' }),
    ).toBeDisabled();
  });

  it('closes when everything has been settled or skipped', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderCycle();

    await userEvent.click(
      screen.getByRole('button', { name: 'Fechar o ciclo' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Fechar Junho de 2026' }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/cycles/2026-06/close',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('offers to reopen a closed cycle', () => {
    stubApi({});
    renderCycle({ status: 'CLOSED' });

    expect(
      screen.getByRole('button', { name: 'Reabrir o ciclo' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Fechar o ciclo' }),
    ).not.toBeInTheDocument();
  });

  // Reopening a cycle four back shifts the entire cash curve since, so the
  // confirmation has to say so before anything is written.
  it('states every downstream balance a reopen would move', async () => {
    stubApi({ '/api/cycles/2026-06/reopen-preview': preview });
    renderCycle({ status: 'CLOSED' });

    await userEvent.click(
      screen.getByRole('button', { name: 'Reabrir o ciclo' }),
    );

    expect(
      await screen.findByText(
        /2 ciclos posteriores abririam com um saldo diferente/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Julho de 2026')).toBeInTheDocument();
    expect(screen.getByText('Agosto de 2026')).toBeInTheDocument();
  });

  it('does not reopen until the preview has been confirmed', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(preview), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderCycle({ status: 'CLOSED' });

    await userEvent.click(
      screen.getByRole('button', { name: 'Reabrir o ciclo' }),
    );
    await screen.findByText(/2 ciclos posteriores/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cycles/2026-06/reopen-preview',
      expect.anything(),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Reabrir' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/cycles/2026-06/reopen',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('says so when a reopen moves nothing downstream', async () => {
    stubApi({
      '/api/cycles/2026-06/reopen-preview': { month: '2026-06', shifts: [] },
    });
    renderCycle({ status: 'CLOSED' });

    await userEvent.click(
      screen.getByRole('button', { name: 'Reabrir o ciclo' }),
    );

    expect(
      await screen.findByText('Nenhum ciclo posterior muda.'),
    ).toBeInTheDocument();
  });
});
