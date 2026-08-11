import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, stubApi } from '@/shared/testing';

import { RegisterPurchaseButton } from './register-purchase-button.js';

const preview = {
  dueDate: '2026-09-10',
  cycleMonth: '2026-09',
  cycleLabel: 'September 2026',
};

function render(cardId = 'inter') {
  return renderWithProviders(
    <RegisterPurchaseButton cardId={cardId} cardName="Inter" />,
  );
}

const open = () =>
  userEvent.click(screen.getByRole('button', { name: 'Register a purchase' }));

function bodyOf(call: unknown) {
  const [, init] = call as [string, RequestInit];

  return JSON.parse((init.body ?? '{}') as string) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RegisterPurchaseButton', () => {
  /**
   * UC-5.4 — a purchase one day after closing shifts an entire cycle in cash
   * terms. The form is where that has to stop being a surprise.
   */
  it('says which invoice and which cycle the purchase lands in', async () => {
    stubApi({ '/api/cards/inter/billing-preview': preview });
    render();

    await open();
    await userEvent.clear(screen.getByLabelText('Purchase date'));
    await userEvent.type(screen.getByLabelText('Purchase date'), '2026-08-20');

    expect(
      await screen.findByText(
        /This will be billed 10\/09\/2026, in the September 2026 cycle/,
      ),
    ).toBeInTheDocument();
  });

  it('asks the card for the preview, rather than guessing from the month', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(preview), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    render();

    await open();
    await userEvent.clear(screen.getByLabelText('Purchase date'));
    await userEvent.type(screen.getByLabelText('Purchase date'), '2026-08-29');

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/cards/inter/billing-preview?purchasedOn=2026-08-29',
        expect.anything(),
      );
    });
  });

  it('registers a single-instalment purchase', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(preview), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    render();

    await open();
    await userEvent.type(screen.getByLabelText('Description'), 'Flights');
    await userEvent.type(screen.getByLabelText('Amount'), '2.400,00');
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/cards/inter/purchases',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    const call = fetchMock.mock.calls.find((each) =>
      (each as unknown as [string])[0].endsWith('/purchases'),
    );

    expect(bodyOf(call)).toMatchObject({
      description: 'Flights',
      amount: 240_000,
      installments: 1,
    });
  });

  // UC-5.2 — registered once, scheduled across N invoices by the app.
  it('splits a purchase into instalments', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(preview), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    render();

    await open();
    await userEvent.type(screen.getByLabelText('Description'), 'Sofa');
    await userEvent.type(screen.getByLabelText('Amount'), '3.000,00');
    await userEvent.clear(screen.getByLabelText('Instalments'));
    await userEvent.type(screen.getByLabelText('Instalments'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((each) =>
        (each as unknown as [string])[0].endsWith('/purchases'),
      );

      expect(bodyOf(call)).toMatchObject({ installments: 10 });
    });
  });

  it('shows what each instalment comes to', async () => {
    stubApi({ '/api/cards/inter/billing-preview': preview });
    render();

    await open();
    await userEvent.type(screen.getByLabelText('Amount'), '3.000,00');
    await userEvent.clear(screen.getByLabelText('Instalments'));
    await userEvent.type(screen.getByLabelText('Instalments'), '10');

    expect(screen.getByText(/10 × R\$ 300,00/)).toBeInTheDocument();
  });

  // UC-5.7 — a returned item, shown distinctly rather than as a small purchase.
  it('registers a refund against the refunds endpoint', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(preview), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    render();

    await open();
    await userEvent.type(screen.getByLabelText('Description'), 'Returned sofa');
    await userEvent.type(screen.getByLabelText('Amount'), '3.000,00');
    await userEvent.click(screen.getByLabelText('This is a refund'));
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/cards/inter/refunds',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('refuses an amount it cannot read', async () => {
    stubApi({ '/api/cards/inter/billing-preview': preview });
    render();

    await open();
    await userEvent.type(screen.getByLabelText('Description'), 'Flights');
    await userEvent.type(screen.getByLabelText('Amount'), 'lots');
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter an amount like 1.234,56',
    );
  });

  it('refuses an instalment count below one', async () => {
    stubApi({ '/api/cards/inter/billing-preview': preview });
    render();

    await open();
    await userEvent.type(screen.getByLabelText('Description'), 'Flights');
    await userEvent.type(screen.getByLabelText('Amount'), '100');
    await userEvent.clear(screen.getByLabelText('Instalments'));
    await userEvent.type(screen.getByLabelText('Instalments'), '0');
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(screen.getByRole('alert')).toHaveTextContent('At least one');
  });
});
