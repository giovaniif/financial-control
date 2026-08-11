import type { BillingPreviewResponse, CardResponse } from '@fin/contracts';
import { describe, expect, it } from 'vitest';

import { ManageCards } from '../../../application/cards/uc-5-manage-cards.js';
import {
  InMemoryCardRepository,
  InMemoryCycleRepository,
  InMemorySettingsRepository,
} from '../../../application/testing/fakes.js';
import {
  PaydayAnchor,
  ShiftPolicy,
} from '../../../domain/budgeting/cycle-ref.js';
import { Card } from '../../../domain/cards/card.js';
import { noHolidays } from '../../../domain/ports/holiday-calendar.js';
import { Money } from '../../../domain/shared/money.js';
import { buildTestServer } from '../testing/test-server.js';

const anchor = PaydayAnchor.of(5, ShiftPolicy.Preceding);

const inter = () =>
  Card.open({
    id: 'card-inter',
    name: 'Inter',
    limit: Money.fromCents(2_500_000),
    closingDay: 28,
    dueDay: 10,
    paymentAccountId: 'acc-inter',
  });

const serverWith = (...cards: Card[]) => {
  let next = 0;

  return buildTestServer({
    manageCards: new ManageCards(
      new InMemoryCardRepository(cards),
      new InMemoryCycleRepository(),
      new InMemorySettingsRepository(anchor),
      noHolidays,
      () => `id-${String(++next)}`,
    ),
  });
};

describe('GET /cards', () => {
  it('lists them with limit, committed and available', async () => {
    const response = await serverWith(inter()).inject({
      method: 'GET',
      url: '/cards',
    });
    const [card] = response.json<CardResponse[]>();

    expect(response.statusCode).toBe(200);
    expect(card?.name).toBe('Inter');
    expect(card?.available).toBe(2_500_000);
    expect(card?.committedToFuture).toBe(0);
  });
});

describe('POST /cards', () => {
  it('answers 201 with the card', async () => {
    const response = await serverWith().inject({
      method: 'POST',
      url: '/cards',
      payload: {
        name: 'Nubank',
        limit: 800_000,
        closingDay: 3,
        dueDay: 10,
        paymentAccountId: 'acc-nubank',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json<CardResponse>().name).toBe('Nubank');
  });

  it.each([
    ['a missing body', {}],
    [
      'a non-numeric limit',
      {
        name: 'X',
        limit: 'lots',
        closingDay: 3,
        dueDay: 10,
        paymentAccountId: 'a',
      },
    ],
  ])('answers 400 to %s', async (_name, payload) => {
    const response = await serverWith().inject({
      method: 'POST',
      url: '/cards',
      payload,
    });

    expect(response.statusCode).toBe(400);
  });

  it('answers 400 to a closing day out of range', async () => {
    const response = await serverWith().inject({
      method: 'POST',
      url: '/cards',
      payload: {
        name: 'X',
        limit: 1,
        closingDay: 32,
        dueDay: 10,
        paymentAccountId: 'a',
      },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('GET /cards/:id/billing-preview', () => {
  // The live line on the purchase form.
  it('says which invoice and which cycle a purchase lands in', async () => {
    const response = await serverWith(inter()).inject({
      method: 'GET',
      url: '/cards/card-inter/billing-preview?purchasedOn=2026-08-20',
    });

    expect(response.json<BillingPreviewResponse>()).toEqual({
      dueDate: '2026-09-10',
      cycleMonth: '2026-09',
      cycleLabel: 'September 2026',
    });
  });

  it('rolls a purchase after closing into the next cycle', async () => {
    const response = await serverWith(inter()).inject({
      method: 'GET',
      url: '/cards/card-inter/billing-preview?purchasedOn=2026-08-29',
    });

    expect(response.json<BillingPreviewResponse>().cycleMonth).toBe('2026-10');
  });

  it('answers 400 without a date', async () => {
    const response = await serverWith(inter()).inject({
      method: 'GET',
      url: '/cards/card-inter/billing-preview',
    });

    expect(response.statusCode).toBe(400);
  });

  it('answers 404 for a card that is not there', async () => {
    const response = await serverWith().inject({
      method: 'GET',
      url: '/cards/missing/billing-preview?purchasedOn=2026-08-20',
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('POST /cards/:id/purchases', () => {
  it('answers 201 and bills the invoice', async () => {
    const response = await serverWith(inter()).inject({
      method: 'POST',
      url: '/cards/card-inter/purchases',
      payload: {
        description: 'Mercado',
        purchasedOn: '2026-08-20',
        amount: -42_000,
      },
    });
    const card = response.json<CardResponse>();

    expect(response.statusCode).toBe(201);
    expect(card.invoices[0]?.total).toBe(-42_000);
    expect(card.invoices[0]?.paidInCycle).toBe('2026-09');
  });

  it('labels instalment positions', async () => {
    const response = await serverWith(inter()).inject({
      method: 'POST',
      url: '/cards/card-inter/purchases',
      payload: {
        description: 'Airfare',
        purchasedOn: '2026-08-20',
        amount: -120_000,
        installments: 3,
      },
    });

    expect(
      response.json<CardResponse>().invoices[0]?.items[0]?.installment,
    ).toBe('1/3');
  });

  it('answers 400 to a malformed body', async () => {
    const response = await serverWith(inter()).inject({
      method: 'POST',
      url: '/cards/card-inter/purchases',
      payload: { description: 'X' },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('refunds, closing and paying over the API', () => {
  const withPurchase = async () => {
    const app = serverWith(inter());
    await app.inject({
      method: 'POST',
      url: '/cards/card-inter/purchases',
      payload: {
        description: 'Chair',
        purchasedOn: '2026-08-20',
        amount: -42_000,
      },
    });
    return app;
  };

  it('registers a refund that reduces the invoice', async () => {
    const app = await withPurchase();

    const response = await app.inject({
      method: 'POST',
      url: '/cards/card-inter/refunds',
      payload: {
        description: 'Returned chair',
        purchasedOn: '2026-08-26',
        amount: 42_000,
      },
    });

    expect(response.json<CardResponse>().invoices[0]?.total).toBe(0);
  });

  it('closes and pays an invoice', async () => {
    const app = await withPurchase();

    await app.inject({
      method: 'POST',
      url: '/cards/card-inter/invoices/card-inter@2026-09-10/close',
    });
    const response = await app.inject({
      method: 'POST',
      url: '/cards/card-inter/invoices/card-inter@2026-09-10/pay',
      payload: { amount: -42_000 },
    });

    expect(response.json<CardResponse>().invoices[0]?.status).toBe('PAID');
    expect(response.json<CardResponse>().committedToFuture).toBe(0);
  });

  it('answers 404 closing an invoice that is not there', async () => {
    const app = await withPurchase();

    const response = await app.inject({
      method: 'POST',
      url: '/cards/card-inter/invoices/missing/close',
    });

    expect(response.statusCode).toBe(404);
  });

  it('answers 400 paying without an amount', async () => {
    const app = await withPurchase();

    const response = await app.inject({
      method: 'POST',
      url: '/cards/card-inter/invoices/card-inter@2026-09-10/pay',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it('answers 404 paying off a purchase with no plan', async () => {
    const app = await withPurchase();

    const response = await app.inject({
      method: 'POST',
      url: '/cards/card-inter/pay-off-early',
      payload: { purchaseId: 'missing' },
    });

    expect(response.statusCode).toBe(404);
  });

  it('deletes a card', async () => {
    const response = await serverWith(inter()).inject({
      method: 'DELETE',
      url: '/cards/card-inter',
    });

    expect(response.statusCode).toBe(204);
  });
});
