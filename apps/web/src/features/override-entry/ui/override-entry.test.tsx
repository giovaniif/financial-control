import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/shared/testing';

import { OverrideEntry } from './override-entry.js';

function stubWrite() {
  const fetchMock = vi.fn(() =>
    Promise.resolve(new Response(null, { status: 204 })),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const renderEntry = (isOverridden = false) =>
  renderWithProviders(
    <OverrideEntry
      month="2026-08"
      entryId="e1"
      planned={-265_000}
      isOverridden={isOverridden}
    />,
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OverrideEntry', () => {
  // UC-3.7 — one cycle's figure changes; the template behind it does not.
  it('overrides this cycle only, leaving the template alone', async () => {
    const fetchMock = stubWrite();
    renderEntry();

    await userEvent.click(screen.getByRole('button', { name: 'Override' }));
    await userEvent.clear(screen.getByLabelText('Amount for this cycle'));
    await userEvent.type(
      screen.getByLabelText('Amount for this cycle'),
      '2.800,00',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Save override' }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/cycles/2026-08/entries/e1/override',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ amount: -280_000 }),
        }),
      );
    });
  });

  it('says the template is untouched, because that is the whole point', async () => {
    stubWrite();
    renderEntry();

    await userEvent.click(screen.getByRole('button', { name: 'Override' }));

    expect(
      screen.getByText(/only this cycle. The template behind it is untouched/),
    ).toBeInTheDocument();
  });

  it('reverts to the projected value in one action', async () => {
    const fetchMock = stubWrite();
    renderEntry(true);

    await userEvent.click(screen.getByRole('button', { name: 'Revert' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/cycles/2026-08/entries/e1/override',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  it('offers no revert on an entry that was never overridden', () => {
    stubWrite();
    renderEntry();

    expect(
      screen.queryByRole('button', { name: 'Revert' }),
    ).not.toBeInTheDocument();
  });

  it('refuses an amount it cannot read', async () => {
    const fetchMock = stubWrite();
    renderEntry();

    await userEvent.click(screen.getByRole('button', { name: 'Override' }));
    await userEvent.clear(screen.getByLabelText('Amount for this cycle'));
    await userEvent.type(screen.getByLabelText('Amount for this cycle'), 'x');
    await userEvent.click(
      screen.getByRole('button', { name: 'Save override' }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter an amount like 1.234,56',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
