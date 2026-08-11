import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/shared/testing';

import { PayOffEarly } from './pay-off-early.js';

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
    <PayOffEarly cardId="inter" purchaseId="p1" description="Sofa 3/10" />,
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PayOffEarly', () => {
  // UC-5.6 — anticipating what is left, so future invoices recalculate.
  it('anticipates the remaining instalments', async () => {
    const fetchMock = stubPost();
    render();

    await userEvent.click(
      screen.getByRole('button', { name: 'Pay off Sofa 3/10 early' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Pay off the rest' }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/cards/inter/pay-off-early',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(bodyOf(fetchMock)).toEqual({ purchaseId: 'p1', discount: 0 });
  });

  it('carries a discount when one was negotiated', async () => {
    const fetchMock = stubPost();
    render();

    await userEvent.click(
      screen.getByRole('button', { name: 'Pay off Sofa 3/10 early' }),
    );
    await userEvent.type(screen.getByLabelText('Discount'), '150,00');
    await userEvent.click(
      screen.getByRole('button', { name: 'Pay off the rest' }),
    );

    await waitFor(() => {
      expect(bodyOf(fetchMock)).toEqual({ purchaseId: 'p1', discount: 15_000 });
    });
  });

  it('says the remaining invoices will change', async () => {
    stubPost();
    render();

    await userEvent.click(
      screen.getByRole('button', { name: 'Pay off Sofa 3/10 early' }),
    );

    expect(
      screen.getByText(/Every remaining instalment is billed now/),
    ).toBeInTheDocument();
  });
});
