import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/shared/testing';

import { SettleButton } from './settle-button.js';

function stubSettle() {
  const fetchMock = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        setTimeout(() => {
          resolve(new Response('null', { status: 200 }));
        }, 0);
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SettleButton', () => {
  it('settles an outgoing entry as paid in one click', async () => {
    const fetchMock = stubSettle();
    renderWithProviders(
      <SettleButton month="2026-08" entryId="e1" isIncoming={false} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Settle' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/cycles/2026-08/entries/e1/settle',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ status: 'PAID' }),
        }),
      );
    });
  });

  it('settles an incoming entry as received', async () => {
    const fetchMock = stubSettle();
    renderWithProviders(
      <SettleButton month="2026-08" entryId="e2" isIncoming label="Confirm" />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/e2/settle'),
        expect.objectContaining({
          body: JSON.stringify({ status: 'RECEIVED' }),
        }),
      );
    });
  });

  // Double-settling is the failure mode of the app's most repeated action.
  it('disables itself while the settle is in flight', async () => {
    // A request that never settles, so the in-flight state is observable.
    const pending = new Promise<Response>(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => pending),
    );
    renderWithProviders(
      <SettleButton month="2026-08" entryId="e3" isIncoming={false} />,
    );

    await userEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('button')).toBeDisabled();
  });
});
