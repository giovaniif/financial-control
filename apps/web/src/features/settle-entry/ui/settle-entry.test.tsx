import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/shared/testing';

import { SettleEntry } from './settle-entry.js';

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

const renderEntry = (planned = -32_000) =>
  renderWithProviders(
    <SettleEntry month="2026-08" entryId="e1" planned={planned} />,
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

    await userEvent.click(screen.getByRole('button', { name: 'Settle' }));

    await waitFor(() => {
      expect(bodyOf(fetchMock)).toEqual({ status: 'PAID' });
    });
  });

  it('confirms money coming in rather than settling it', async () => {
    const fetchMock = stubSettle();
    renderEntry(1_800_000);

    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(bodyOf(fetchMock)).toEqual({ status: 'RECEIVED' });
    });
  });

  it('settles at a different actual in two', async () => {
    const fetchMock = stubSettle();
    renderEntry();

    await userEvent.click(
      screen.getByRole('button', { name: 'Settle at a different amount' }),
    );
    await userEvent.clear(screen.getByLabelText('Actual amount'));
    await userEvent.type(screen.getByLabelText('Actual amount'), '345,90');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(bodyOf(fetchMock)).toEqual({ status: 'PAID', actual: -34_590 });
    });
  });

  it('opens prefilled with the planned amount, since it usually matches', async () => {
    stubSettle();
    renderEntry();

    await userEvent.click(
      screen.getByRole('button', { name: 'Settle at a different amount' }),
    );

    expect(screen.getByLabelText('Actual amount')).toHaveValue('320,00');
  });

  // A plan that never happened is not the same as one paid at zero.
  it('skips an entry that never happened', async () => {
    const fetchMock = stubSettle();
    renderEntry();

    await userEvent.click(
      screen.getByRole('button', { name: 'Settle at a different amount' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Skip it' }));

    await waitFor(() => {
      expect(bodyOf(fetchMock)).toEqual({ status: 'SKIPPED' });
    });
  });

  it('refuses an actual it cannot read', async () => {
    const fetchMock = stubSettle();
    renderEntry();

    await userEvent.click(
      screen.getByRole('button', { name: 'Settle at a different amount' }),
    );
    await userEvent.clear(screen.getByLabelText('Actual amount'));
    await userEvent.type(screen.getByLabelText('Actual amount'), 'about 300');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter an amount like 1.234,56',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
