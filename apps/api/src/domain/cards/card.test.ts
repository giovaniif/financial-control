import { describe, expect, it } from 'vitest';

import { CycleRef, PaydayAnchor, ShiftPolicy } from '../budgeting/cycle-ref.js';
import { noHolidays } from '../ports/holiday-calendar.js';
import { LocalDate } from '../shared/local-date.js';
import { Money } from '../shared/money.js';
import { Card, InvalidCard, PurchaseNotFound } from './card.js';
import { InvoiceStatus } from './invoice.js';

const date = (iso: string) => LocalDate.parse(iso);
const reais = (amount: number) => Money.fromCents(Math.round(amount * 100));

/** The Inter card from UC-5.4: closes on the 28th, due on the 10th. */
const inter = (overrides: Partial<Parameters<typeof Card.open>[0]> = {}) =>
  Card.open({
    id: 'card-inter',
    name: 'Inter',
    limit: reais(25_000),
    closingDay: 28,
    dueDay: 10,
    paymentAccountId: 'acc-inter',
    ...overrides,
  });

const newInvoiceId = (dueDate: LocalDate) => `inv-${dueDate.toISO()}`;
const newItemId = (purchaseId: string, position: number) =>
  `${purchaseId}-${String(position)}`;

const purchase = (
  card: Card,
  input: {
    purchaseId?: string;
    description?: string;
    on: string;
    amount: number;
    installments?: number;
  },
) =>
  card.registerPurchase({
    purchaseId: input.purchaseId ?? 'p1',
    description: input.description ?? 'Something',
    purchasedOn: date(input.on),
    amount: reais(input.amount),
    ...(input.installments === undefined
      ? {}
      : { installments: input.installments }),
    newInvoiceId,
    newItemId,
  });

describe('Card.open', () => {
  it.each(['', '   '])('rejects a blank name (%s)', (name) => {
    expect(() => inter({ name })).toThrow(InvalidCard);
  });

  it('rejects a negative limit', () => {
    expect(() => inter({ limit: reais(-1) })).toThrow(InvalidCard);
  });

  it.each([
    ['closing', { closingDay: 0 }],
    ['due', { dueDay: 32 }],
  ])('rejects an out-of-range %s day', (_name, overrides) => {
    expect(() => inter(overrides)).toThrow(InvalidCard);
  });
});

describe('Card.periodFor — the closing day decides the invoice', () => {
  it('bills a purchase before closing onto the invoice due next month', () => {
    const period = inter().periodFor(date('2026-08-20'));

    expect(period.start.toISO()).toBe('2026-07-29');
    expect(period.end.toISO()).toBe('2026-08-28');
    expect(period.dueDate.toISO()).toBe('2026-09-10');
  });

  // Nine days later on the calendar, an entire cycle later in cash terms.
  it('rolls a purchase after closing into the following invoice', () => {
    const period = inter().periodFor(date('2026-08-29'));

    expect(period.start.toISO()).toBe('2026-08-29');
    expect(period.end.toISO()).toBe('2026-09-28');
    expect(period.dueDate.toISO()).toBe('2026-10-10');
  });

  it('treats the closing day itself as inside the period it closes', () => {
    expect(inter().periodFor(date('2026-08-28')).dueDate.toISO()).toBe(
      '2026-09-10',
    );
  });

  // A card closing on the 3rd and due on the 10th bills within one month.
  it('bills into the same month when the due day follows the closing day', () => {
    const nubank = inter({ closingDay: 3, dueDay: 10 });

    expect(nubank.periodFor(date('2026-08-02')).dueDate.toISO()).toBe(
      '2026-08-10',
    );
  });

  it('clamps a closing day onto a short month', () => {
    const card = inter({ closingDay: 31 });

    expect(card.periodFor(date('2026-02-15')).end.toISO()).toBe('2026-02-28');
  });
});

// UC-5.4 in full: which cycle actually pays for a purchase.
describe('the cycle that pays an invoice', () => {
  const anchor = PaydayAnchor.of(5, ShiftPolicy.Preceding);
  const cycle = (month: string) => CycleRef.forMonth(month, anchor, noHolidays);

  it('pays a 20 Aug purchase in the September cycle', () => {
    const { dueDate } = inter().periodFor(date('2026-08-20'));

    expect(cycle('2026-10').contains(dueDate)).toBe(true);
    expect(cycle('2026-09').contains(dueDate)).toBe(false);
  });

  it('pays a 29 Aug purchase in the October cycle', () => {
    const { dueDate } = inter().periodFor(date('2026-08-29'));

    expect(cycle('2026-11').contains(dueDate)).toBe(true);
    expect(cycle('2026-10').contains(dueDate)).toBe(false);
  });
});

describe('Card.registerPurchase', () => {
  it('opens the invoice the purchase belongs to and bills it there', () => {
    const card = purchase(inter(), { on: '2026-08-20', amount: -420 });

    expect(card.invoices).toHaveLength(1);
    expect(card.invoices[0]?.dueDate.toISO()).toBe('2026-09-10');
    expect(card.invoices[0]?.total.cents).toBe(-42_000);
  });

  it('reuses an invoice already opened for that period', () => {
    const card = purchase(
      purchase(inter(), { purchaseId: 'p1', on: '2026-08-20', amount: -420 }),
      { purchaseId: 'p2', on: '2026-08-22', amount: -180 },
    );

    expect(card.invoices).toHaveLength(1);
    expect(card.invoices[0]?.items).toHaveLength(2);
    expect(card.invoices[0]?.total.cents).toBe(-60_000);
  });

  it('puts purchases either side of closing on different invoices', () => {
    const card = purchase(
      purchase(inter(), { purchaseId: 'p1', on: '2026-08-20', amount: -420 }),
      { purchaseId: 'p2', on: '2026-08-29', amount: -180 },
    );

    expect(card.invoices.map((i) => i.dueDate.toISO())).toEqual([
      '2026-09-10',
      '2026-10-10',
    ]);
  });

  it.each([0, -1, 2.5])('rejects %s instalments', (installments) => {
    expect(() =>
      purchase(inter(), { on: '2026-08-20', amount: -420, installments }),
    ).toThrow(InvalidCard);
  });

  it('rejects a blank description', () => {
    expect(() =>
      purchase(inter(), { description: '  ', on: '2026-08-20', amount: -420 }),
    ).toThrow(InvalidCard);
  });

  it('leaves a single purchase without an instalment plan', () => {
    expect(purchase(inter(), { on: '2026-08-20', amount: -420 }).plans).toEqual(
      [],
    );
  });
});

describe('Card instalments', () => {
  const split = () =>
    purchase(inter(), {
      description: 'Airfare',
      on: '2026-08-20',
      amount: -1_000,
      installments: 3,
    });

  it('bills one instalment onto each of N consecutive invoices', () => {
    const card = split();

    expect(card.invoices.map((i) => i.dueDate.toISO())).toEqual([
      '2026-09-10',
      '2026-10-10',
      '2026-11-10',
    ]);
  });

  it('labels each instalment with its position', () => {
    const positions = split().invoices.map((invoice) =>
      invoice.items[0]?.installment?.toString(),
    );

    expect(positions).toEqual(['1/3', '2/3', '3/3']);
  });

  // The last instalment absorbs the remainder, so cents never vanish.
  it('bills exactly what was purchased across the instalments', () => {
    const total = Money.sum(split().invoices.map((invoice) => invoice.total));

    expect(total.cents).toBe(-100_000);
  });

  it('splits an amount that does not divide evenly without losing a cent', () => {
    const card = purchase(inter(), {
      on: '2026-08-20',
      amount: -100,
      installments: 3,
    });

    expect(card.invoices.map((i) => i.total.cents)).toEqual([
      -3_333, -3_333, -3_334,
    ]);
  });

  it('records the plan so the remaining instalments are known', () => {
    const [plan] = split().plans;

    expect(plan?.totalInstallments).toBe(3);
    expect(plan?.total.cents).toBe(-100_000);
  });
});

describe('Card.payOffEarly', () => {
  const split = () =>
    purchase(inter(), {
      description: 'Airfare',
      on: '2026-08-20',
      amount: -900,
      installments: 3,
    });

  it('brings the remaining instalments onto the earliest open invoice', () => {
    const card = split().payOffEarly({ purchaseId: 'p1', newItemId });

    expect(card.invoices[0]?.total.cents).toBe(-90_000);
    expect(card.invoices[1]?.total.isZero()).toBe(true);
  });

  it('applies a discount to what is settled', () => {
    const card = split().payOffEarly({
      purchaseId: 'p1',
      discount: reais(50),
      newItemId,
    });

    expect(card.invoices[0]?.total.cents).toBe(-85_000);
  });

  it('retires the plan', () => {
    expect(
      split().payOffEarly({ purchaseId: 'p1', newItemId }).plans,
    ).toHaveLength(0);
  });

  it('refuses a purchase with no plan', () => {
    expect(() =>
      inter().payOffEarly({ purchaseId: 'missing', newItemId }),
    ).toThrow(PurchaseNotFound);
  });
});

describe('Card refunds', () => {
  it('reduces the invoice total', () => {
    const card = purchase(
      purchase(inter(), { purchaseId: 'p1', on: '2026-08-20', amount: -420 }),
      {
        purchaseId: 'p1-refund',
        description: 'Returned',
        on: '2026-08-26',
        amount: 420,
      },
    );

    expect(card.invoices[0]?.total.isZero()).toBe(true);
    expect(card.invoices[0]?.items).toHaveLength(2);
  });
});

describe('Card invoice lifecycle', () => {
  const withInvoice = () =>
    purchase(inter(), { on: '2026-08-20', amount: -420 });
  const invoiceId = 'inv-2026-09-10';

  it('closes an invoice, after which it takes no new items', () => {
    const card = withInvoice().closeInvoice(invoiceId);

    expect(card.invoiceById(invoiceId)?.status).toBe(InvoiceStatus.Closed);
    expect(() =>
      purchase(card, { purchaseId: 'p2', on: '2026-08-22', amount: -100 }),
    ).toThrow();
  });

  it('pays an invoice, recording what actually went out', () => {
    const card = withInvoice()
      .closeInvoice(invoiceId)
      .payInvoice(invoiceId, reais(-420));

    expect(card.invoiceById(invoiceId)?.status).toBe(InvoiceStatus.Paid);
    expect(card.invoiceById(invoiceId)?.paidAmount?.cents).toBe(-42_000);
  });

  it('refuses an invoice that is not there', () => {
    expect(() => inter().closeInvoice('missing')).toThrow(PurchaseNotFound);
  });

  it('finds the open invoice covering a date', () => {
    expect(withInvoice().openInvoiceOn(date('2026-08-22'))?.id).toBe(invoiceId);
    expect(withInvoice().openInvoiceOn(date('2026-09-15'))).toBeUndefined();
  });
});

describe('Card limit and commitment', () => {
  // The figure the spreadsheet could not produce.
  it('totals what is committed to invoices not yet paid', () => {
    const card = purchase(inter(), {
      on: '2026-08-20',
      amount: -1_200,
      installments: 4,
    });

    expect(card.committedToFutureInvoices.cents).toBe(120_000);
    expect(card.availableLimit.cents).toBe(2_500_000 - 120_000);
  });

  it('drops a paid invoice out of the commitment', () => {
    const card = purchase(inter(), { on: '2026-08-20', amount: -420 })
      .closeInvoice('inv-2026-09-10')
      .payInvoice('inv-2026-09-10', reais(-420));

    expect(card.committedToFutureInvoices.isZero()).toBe(true);
  });

  it('commits nothing on a card with no invoices', () => {
    expect(inter().committedToFutureInvoices.isZero()).toBe(true);
    expect(inter().availableLimit.cents).toBe(2_500_000);
  });
});

describe('Card edge cases', () => {
  it('reports no invoice for an id that is not there', () => {
    expect(inter().invoiceById('missing')).toBeUndefined();
  });

  it('refuses to pay an invoice that is not there', () => {
    expect(() => inter().payInvoice('missing', reais(-1))).toThrow(
      PurchaseNotFound,
    );
  });

  it('closing an already-closed invoice changes nothing', () => {
    const card = purchase(inter(), { on: '2026-08-20', amount: -420 })
      .closeInvoice('inv-2026-09-10')
      .closeInvoice('inv-2026-09-10');

    expect(card.invoiceById('inv-2026-09-10')?.status).toBe(
      InvoiceStatus.Closed,
    );
  });

  it('refuses to pay an invoice twice', () => {
    const card = purchase(inter(), { on: '2026-08-20', amount: -420 })
      .closeInvoice('inv-2026-09-10')
      .payInvoice('inv-2026-09-10', reais(-420));

    expect(() => card.payInvoice('inv-2026-09-10', reais(-420))).toThrow();
  });

  it('refuses an item outside the invoice period', () => {
    const card = purchase(inter(), { on: '2026-08-20', amount: -420 });
    const invoice = card.invoiceById('inv-2026-09-10');

    expect(() =>
      invoice?.addItem({
        id: 'stray',
        purchaseId: 'p9',
        description: 'Outside',
        purchasedOn: date('2026-10-15'),
        amount: reais(-10),
        installment: undefined,
      }),
    ).toThrow();
  });

  it('refuses to strip items from a closed invoice', () => {
    const card = purchase(inter(), {
      on: '2026-08-20',
      amount: -420,
    }).closeInvoice('inv-2026-09-10');

    expect(() =>
      card.invoiceById('inv-2026-09-10')?.removeItemsOfPurchase('p1'),
    ).toThrow();
  });

  it('pays off early with no discount when none is given', () => {
    const card = purchase(inter(), {
      description: 'Airfare',
      on: '2026-08-20',
      amount: -900,
      installments: 3,
    });

    const settled = card.payOffEarly({ purchaseId: 'p1', newItemId });

    expect(settled.invoices[0]?.total.cents).toBe(-90_000);
  });

  it('leaves a plan whose instalments are all billed to closed invoices', () => {
    const card = purchase(inter(), {
      description: 'Airfare',
      on: '2026-08-20',
      amount: -900,
      installments: 3,
    })
      .closeInvoice('inv-2026-09-10')
      .closeInvoice('inv-2026-10-10')
      .closeInvoice('inv-2026-11-10');

    expect(
      card.payOffEarly({ purchaseId: 'p1', newItemId }).plans,
    ).toHaveLength(1);
  });
});
