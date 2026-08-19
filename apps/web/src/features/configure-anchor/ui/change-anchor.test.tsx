import type { AnchorChangePreviewResponse } from '@fin/contracts';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/shared/testing';

import { ChangeAnchor } from './change-anchor.js';

const preview = (
  overrides: Partial<AnchorChangePreviewResponse> = {},
): AnchorChangePreviewResponse => ({
  current: { anchorDay: 5, shiftPolicy: 'PRECEDING' },
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
  ...overrides,
});

function stubWith(body: unknown, status = 200) {
  const fetchMock = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const render = () =>
  renderWithProviders(<ChangeAnchor anchorDay={5} shiftPolicy="PRECEDING" />);

const open = () =>
  userEvent.click(
    screen.getByRole('button', { name: 'Alterar o dia do pagamento' }),
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ChangeAnchor', () => {
  /**
   * UC-1.1 — changing the anchor re-slices every open cycle, so the effect is
   * shown and confirmed before anything is written.
   */
  it('previews the effect before changing anything', async () => {
    const fetchMock = stubWith(preview());
    render();

    await open();
    await userEvent.clear(screen.getByLabelText('Dia do mês'));
    await userEvent.type(screen.getByLabelText('Dia do mês'), '7');
    await userEvent.click(
      screen.getByRole('button', { name: 'Pré-visualizar' }),
    );

    expect(
      await screen.findByText(/3 lançamentos mudariam de ciclo/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/5 ago – 3 set → 7 ago – 6 set/),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings/anchor/preview',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('does not change the anchor until the preview is confirmed', async () => {
    const fetchMock = stubWith(preview());
    render();

    await open();
    await userEvent.click(
      screen.getByRole('button', { name: 'Pré-visualizar' }),
    );
    await screen.findByText(/3 lançamentos mudariam/);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await userEvent.click(
      screen.getByRole('button', { name: 'Aplicar a mudança' }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/settings/anchor',
        expect.objectContaining({ method: 'PUT' }),
      );
    });
  });

  it('says closed cycles are never re-sliced', async () => {
    stubWith(preview());
    render();

    await open();

    expect(
      screen.getByText(/Os ciclos fechados nunca têm seus limites redefinidos/),
    ).toBeInTheDocument();
  });

  // A change that would leave an entry outside every open cycle is refused.
  it('blocks a change that would orphan an entry', async () => {
    stubWith(preview({ orphanedEntries: 2 }));
    render();

    await open();
    await userEvent.click(
      screen.getByRole('button', { name: 'Pré-visualizar' }),
    );

    expect(
      await screen.findByText(
        /2 lançamentos ficariam fora de todos os ciclos em aberto/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Aplicar a mudança' }),
    ).toBeDisabled();
  });

  it('explains a refusal from the server rather than showing a status code', async () => {
    render();
    await open();

    const fetchMock = vi.fn((input: string) =>
      Promise.resolve(
        input.endsWith('/preview')
          ? new Response(JSON.stringify(preview()), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          : new Response(
              JSON.stringify({ error: 'Two entries are orphaned.' }),
              {
                status: 409,
                headers: { 'Content-Type': 'application/json' },
              },
            ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await userEvent.click(
      screen.getByRole('button', { name: 'Pré-visualizar' }),
    );
    await screen.findByText(/3 lançamentos mudariam/);
    await userEvent.click(
      screen.getByRole('button', { name: 'Aplicar a mudança' }),
    );

    // The preview is an alert of its own, so this asserts the refusal itself.
    expect(
      await screen.findByText('Two entries are orphaned.'),
    ).toHaveAttribute('role', 'alert');
  });

  it('changes the weekend rule too', async () => {
    const fetchMock = stubWith(preview());
    render();

    await open();
    await userEvent.selectOptions(
      screen.getByLabelText('Quando cai num fim de semana ou feriado'),
      'O dia útil seguinte',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Pré-visualizar' }),
    );

    await waitFor(() => {
      const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];

      expect(JSON.parse((call[1].body ?? '{}') as string)).toEqual({
        anchorDay: 5,
        shiftPolicy: 'FOLLOWING',
      });
    });
  });
});
