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
      label="June 2026"
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
      screen.getByRole('button', { name: 'Close the cycle' }),
    );

    expect(
      screen.getByRole('dialog', { name: 'Close June 2026' }),
    ).toBeInTheDocument();
  });

  it('is never offered for a cycle still running', () => {
    stubApi({});
    renderWithProviders(
      <CloseCycle
        month="2026-08"
        label="August 2026"
        status="OPEN"
        hasEnded={false}
        unsettled={0}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Close the cycle' }),
    ).not.toBeInTheDocument();
  });

  // A cycle cannot close while anything is unsettled, so the form says how
  // many rather than letting the API answer with a 409.
  it('names what is blocking rather than just refusing', async () => {
    stubApi({});
    renderCycle({ unsettled: 3 });

    await userEvent.click(
      screen.getByRole('button', { name: 'Close the cycle' }),
    );

    expect(
      screen.getByText(/3 entries are still unsettled/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Close June 2026' }),
    ).toBeDisabled();
  });

  it('closes when everything has been settled or skipped', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderCycle();

    await userEvent.click(
      screen.getByRole('button', { name: 'Close the cycle' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Close June 2026' }),
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
      screen.getByRole('button', { name: 'Reopen the cycle' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Close the cycle' }),
    ).not.toBeInTheDocument();
  });

  // Reopening a cycle four back shifts the entire cash curve since, so the
  // confirmation has to say so before anything is written.
  it('states every downstream balance a reopen would move', async () => {
    stubApi({ '/api/cycles/2026-06/reopen-preview': preview });
    renderCycle({ status: 'CLOSED' });

    await userEvent.click(
      screen.getByRole('button', { name: 'Reopen the cycle' }),
    );

    expect(
      await screen.findByText(/2 later cycles would open at a different/),
    ).toBeInTheDocument();
    expect(screen.getByText('July 2026')).toBeInTheDocument();
    expect(screen.getByText('August 2026')).toBeInTheDocument();
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
      screen.getByRole('button', { name: 'Reopen the cycle' }),
    );
    await screen.findByText(/2 later cycles/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cycles/2026-06/reopen-preview',
      expect.anything(),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Reopen' }));

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
      screen.getByRole('button', { name: 'Reopen the cycle' }),
    );

    expect(
      await screen.findByText('No later cycle changes.'),
    ).toBeInTheDocument();
  });
});
