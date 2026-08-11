import type { InvoiceResponse } from '@fin/contracts';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/shared/testing';

import { PayInvoice } from './pay-invoice.js';

const invoice = (
  overrides: Partial<InvoiceResponse> = {},
): InvoiceResponse => ({
  id: 'inv-1',
  periodStart: '2026-07-29',
  periodEnd: '2026-08-28',
  dueDate: '2026-09-10',
  status: 'CLOSED',
  total: -240_000,
  paidInCycle: 'September 2026',
  items: [],
  ...overrides,
});

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PayInvoice', () => {
  it('pays a closed invoice at its total', async () => {
    const fetchMock = stubPost();
    renderWithProviders(<PayInvoice cardId="inter" invoice={invoice()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Pay' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Record the payment' }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/cards/inter/invoices/inv-1/pay',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(bodyOf(fetchMock)).toEqual({ amount: -240_000 });
  });

  // The amount actually paid is not always the amount billed.
  it('records a different amount when one was paid', async () => {
    const fetchMock = stubPost();
    renderWithProviders(<PayInvoice cardId="inter" invoice={invoice()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Pay' }));
    await userEvent.clear(screen.getByLabelText('Amount paid'));
    await userEvent.type(screen.getByLabelText('Amount paid'), '2.350,00');
    await userEvent.click(
      screen.getByRole('button', { name: 'Record the payment' }),
    );

    await waitFor(() => {
      expect(bodyOf(fetchMock)).toEqual({ amount: -235_000 });
    });
  });

  it('offers no payment on an invoice already paid', () => {
    stubPost();
    renderWithProviders(
      <PayInvoice cardId="inter" invoice={invoice({ status: 'PAID' })} />,
    );

    expect(
      screen.queryByRole('button', { name: 'Pay' }),
    ).not.toBeInTheDocument();
  });

  // An open invoice is still collecting purchases; there is nothing final to pay.
  it('offers no payment on an invoice still open', () => {
    stubPost();
    renderWithProviders(
      <PayInvoice cardId="inter" invoice={invoice({ status: 'OPEN' })} />,
    );

    expect(
      screen.queryByRole('button', { name: 'Pay' }),
    ).not.toBeInTheDocument();
  });

  it('states which cycle the payment falls in', async () => {
    stubPost();
    renderWithProviders(<PayInvoice cardId="inter" invoice={invoice()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Pay' }));

    expect(
      screen.getByText(/paid in the September 2026 cycle/),
    ).toBeInTheDocument();
  });
});
