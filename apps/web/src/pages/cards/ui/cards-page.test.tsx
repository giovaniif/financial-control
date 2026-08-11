import type { CardResponse } from '@fin/contracts';
import { screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, stubApi } from '@/shared/testing';

import { CardsPage } from './cards-page.js';

const inter = (overrides: Partial<CardResponse> = {}): CardResponse => ({
  id: 'card-inter',
  name: 'Inter',
  limit: 2_500_000,
  closingDay: 28,
  dueDay: 10,
  paymentAccountId: 'acc',
  committedToFuture: 120_000,
  available: 2_380_000,
  invoices: [],
  ...overrides,
});

const renderPage = () =>
  renderWithProviders(
    <RouterProvider
      router={createMemoryRouter([{ path: '/', element: <CardsPage /> }])}
    />,
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CardsPage', () => {
  it('explains what a card needs when there are none', async () => {
    stubApi({ '/api/cards': [] });
    renderPage();

    expect(await screen.findByText('No cards yet')).toBeInTheDocument();
  });

  // The figure the spreadsheet could not produce.
  it('shows the limit, what is committed and what is left', async () => {
    stubApi({ '/api/cards': [inter()] });
    renderPage();

    expect(await screen.findByText('Inter')).toBeInTheDocument();
    expect(screen.getByText('Committed')).toBeInTheDocument();
    expect(screen.getByText('R$ 1.200,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 23.800,00')).toBeInTheDocument();
  });

  it('states the closing and due days that drive everything', async () => {
    stubApi({ '/api/cards': [inter()] });
    renderPage();

    expect(await screen.findByText('closes 28 · due 10')).toBeInTheDocument();
  });

  // UC-5.4 — which cycle actually pays for it.
  it('says which cycle pays each invoice', async () => {
    stubApi({
      '/api/cards': [
        inter({
          invoices: [
            {
              id: 'inv1',
              periodStart: '2026-07-29',
              periodEnd: '2026-08-28',
              dueDate: '2026-09-10',
              status: 'OPEN',
              total: -42_000,
              paidInCycle: '2026-09',
              items: [],
            },
          ],
        }),
      ],
    });
    renderPage();

    expect(await screen.findByText('Due 10/09/2026')).toBeInTheDocument();
    expect(screen.getByText('paid in the 2026-09 cycle')).toBeInTheDocument();
  });

  it('labels an instalment with its position', async () => {
    stubApi({
      '/api/cards': [
        inter({
          invoices: [
            {
              id: 'inv1',
              periodStart: '2026-07-29',
              periodEnd: '2026-08-28',
              dueDate: '2026-09-10',
              status: 'OPEN',
              total: -40_000,
              paidInCycle: '2026-09',
              items: [
                {
                  id: 'i1',
                  purchaseId: 'p-i1',
                  description: 'Airfare',
                  purchasedOn: '2026-08-20',
                  amount: -40_000,
                  installment: '1/3',
                  isRefund: false,
                },
              ],
            },
          ],
        }),
      ],
    });
    renderPage();

    expect(await screen.findByText('Airfare')).toBeInTheDocument();
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });

  it('marks a refund distinctly', async () => {
    stubApi({
      '/api/cards': [
        inter({
          invoices: [
            {
              id: 'inv1',
              periodStart: '2026-07-29',
              periodEnd: '2026-08-28',
              dueDate: '2026-09-10',
              status: 'OPEN',
              total: 0,
              paidInCycle: '2026-09',
              items: [
                {
                  id: 'i1',
                  purchaseId: 'p-i1',
                  description: 'Returned chair',
                  purchasedOn: '2026-08-26',
                  amount: 42_000,
                  installment: null,
                  isRefund: true,
                },
              ],
            },
          ],
        }),
      ],
    });
    renderPage();

    expect(await screen.findByText('refund')).toBeInTheDocument();
  });

  it('offers to register a purchase on the selected card', async () => {
    stubApi({ '/api/cards': [inter()] });
    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Register a purchase' }),
    ).toBeInTheDocument();
  });

  it('offers to add a card even before there is one', async () => {
    stubApi({
      '/api/cards': [],
      '/api/accounts': {
        accounts: [
          { id: 'a', name: 'Inter Checking', type: 'CHECKING', balance: 1 },
        ],
        total: 1,
      },
    });
    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Add a card' }),
    ).toBeInTheDocument();
  });
});
