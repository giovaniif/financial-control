import { describe, expect, it } from 'vitest';

import {
  CycleRef,
  PaydayAnchor,
  ShiftPolicy,
} from '../../domain/budgeting/cycle-ref.js';
import { Cycle } from '../../domain/budgeting/cycle.js';
import { EntryKind } from '../../domain/budgeting/ledger-entry.js';
import { Card } from '../../domain/cards/card.js';
import { InvoiceStatus } from '../../domain/cards/invoice.js';
import { noHolidays } from '../../domain/ports/holiday-calendar.js';
import { Money } from '../../domain/shared/money.js';
import { SettlementStatus } from '../../domain/shared/planned-actual.js';
import {
  InMemoryCardRepository,
  InMemoryCycleRepository,
  InMemorySettingsRepository,
} from '../testing/fakes.js';
import { CardNotFound, ManageCards } from './uc-5-manage-cards.js';

const anchor = PaydayAnchor.of(5, ShiftPolicy.Preceding);
const cycle = (month: string) => CycleRef.forMonth(month, anchor, noHolidays);
const reais = (amount: number) => Money.fromCents(Math.round(amount * 100));

/** The Inter card from UC-5.4: closes on the 28th, due on the 10th. */
const inter = () =>
  Card.open({
    id: 'card-inter',
    name: 'Inter',
    limit: reais(25_000),
    closingDay: 28,
    dueDay: 10,
    paymentAccountId: 'acc-inter',
  });

const managing = (options: { cards?: Card[]; cycles?: Cycle[] } = {}) => {
  const cardRepo = new InMemoryCardRepository(options.cards ?? []);
  const cycleRepo = new InMemoryCycleRepository(options.cycles ?? []);
  let next = 0;

  return {
    cardRepo,
    cycleRepo,
    useCase: new ManageCards(
      cardRepo,
      cycleRepo,
      new InMemorySettingsRepository(anchor),
      noHolidays,
      () => `id-${String(++next)}`,
    ),
  };
};

describe('ManageCards.previewBilling', () => {
  // The surprise this exists to prevent: nine days apart, a cycle apart.
  it('bills a 20 Aug purchase into the September cycle', async () => {
    const { useCase } = managing({ cards: [inter()] });

    const preview = await useCase.previewBilling('card-inter', '2026-08-20');

    expect(preview.dueDate).toBe('2026-09-10');
    expect(preview.cycleMonth).toBe('2026-10');
    expect(preview.cycleLabel).toBe('October 2026');
  });

  it('bills a 29 Aug purchase into the October cycle', async () => {
    const { useCase } = managing({ cards: [inter()] });

    const preview = await useCase.previewBilling('card-inter', '2026-08-29');

    expect(preview.dueDate).toBe('2026-10-10');
    expect(preview.cycleMonth).toBe('2026-11');
  });

  it('persists nothing', async () => {
    const { useCase, cycleRepo } = managing({ cards: [inter()] });

    await useCase.previewBilling('card-inter', '2026-08-20');

    expect(cycleRepo.saved).toHaveLength(0);
  });

  it('refuses a card that is not there', async () => {
    const { useCase } = managing();

    await expect(
      useCase.previewBilling('missing', '2026-08-20'),
    ).rejects.toThrow(CardNotFound);
  });
});

describe('ManageCards.registerPurchase', () => {
  it('bills it onto the right invoice', async () => {
    const { useCase } = managing({ cards: [inter()] });

    const card = await useCase.registerPurchase({
      cardId: 'card-inter',
      description: 'Mercado',
      purchasedOn: '2026-08-20',
      amountCents: -42_000,
    });

    expect(card.invoices).toHaveLength(1);
    expect(card.invoices[0]?.dueDate).toBe('2026-09-10');
    expect(card.invoices[0]?.totalCents).toBe(-42_000);
  });

  it('reports which cycle each invoice is paid in', async () => {
    const { useCase } = managing({ cards: [inter()] });

    const card = await useCase.registerPurchase({
      cardId: 'card-inter',
      description: 'Mercado',
      purchasedOn: '2026-08-20',
      amountCents: -42_000,
    });

    expect(card.invoices[0]?.paidInCycle).toBe('2026-10');
  });

  it('spreads instalments across consecutive invoices', async () => {
    const { useCase } = managing({ cards: [inter()] });

    const card = await useCase.registerPurchase({
      cardId: 'card-inter',
      description: 'Airfare',
      purchasedOn: '2026-08-20',
      amountCents: -120_000,
      installments: 3,
    });

    expect(card.invoices.map((i) => i.totalCents)).toEqual([
      -40_000, -40_000, -40_000,
    ]);
    expect(card.invoices[0]?.items[0]?.installment).toBe('1/3');
  });

  it('reports the committed future and what is left of the limit', async () => {
    const { useCase } = managing({ cards: [inter()] });

    const card = await useCase.registerPurchase({
      cardId: 'card-inter',
      description: 'Airfare',
      purchasedOn: '2026-08-20',
      amountCents: -120_000,
      installments: 3,
    });

    expect(card.committedToFutureCents).toBe(120_000);
    expect(card.availableCents).toBe(2_500_000 - 120_000);
  });
});

// The seam between Cards and Budgeting.
describe('an invoice becomes a ledger entry in the cycle that pays it', () => {
  it('lands the invoice on its due date in the September cycle', async () => {
    const { useCase, cycleRepo } = managing({ cards: [inter()] });

    await useCase.registerPurchase({
      cardId: 'card-inter',
      description: 'Mercado',
      purchasedOn: '2026-08-20',
      amountCents: -42_000,
    });

    const september = await cycleRepo.findByMonth(cycle('2026-10'));
    const entry = september?.entries[0];

    expect(entry?.description).toBe('Inter — invoice');
    expect(entry?.kind).toBe(EntryKind.Invoice);
    expect(entry?.dueDate.toISO()).toBe('2026-09-10');
    expect(entry?.amount.planned.cents).toBe(-42_000);
  });

  it('leaves the August cycle untouched', async () => {
    const { useCase, cycleRepo } = managing({ cards: [inter()] });

    await useCase.registerPurchase({
      cardId: 'card-inter',
      description: 'Mercado',
      purchasedOn: '2026-08-20',
      amountCents: -42_000,
    });

    expect(await cycleRepo.findByMonth(cycle('2026-09'))).toBeUndefined();
  });

  it('updates the existing line rather than adding a second', async () => {
    const { useCase, cycleRepo } = managing({ cards: [inter()] });

    await useCase.registerPurchase({
      cardId: 'card-inter',
      description: 'Mercado',
      purchasedOn: '2026-08-20',
      amountCents: -42_000,
    });
    await useCase.registerPurchase({
      cardId: 'card-inter',
      description: 'Posto',
      purchasedOn: '2026-08-22',
      amountCents: -18_000,
    });

    const september = await cycleRepo.findByMonth(cycle('2026-10'));
    expect(september?.entries).toHaveLength(1);
    expect(september?.entries[0]?.amount.planned.cents).toBe(-60_000);
  });

  // The settled line records what actually went out; regenerating must not
  // quietly rewrite history.
  it('leaves a settled invoice line alone', async () => {
    const { useCase, cycleRepo } = managing({ cards: [inter()] });

    await useCase.registerPurchase({
      cardId: 'card-inter',
      description: 'Mercado',
      purchasedOn: '2026-08-20',
      amountCents: -42_000,
    });

    const september = await cycleRepo.findByMonth(cycle('2026-10'));
    const entryId = september?.entries[0]?.id ?? '';
    if (september === undefined) {
      throw new Error('expected the invoice to have materialised a cycle');
    }
    await cycleRepo.save(
      september.settleEntry(entryId, reais(-420), SettlementStatus.Paid),
    );

    await useCase.registerPurchase({
      cardId: 'card-inter',
      description: 'Posto',
      purchasedOn: '2026-08-22',
      amountCents: -18_000,
    });

    const after = await cycleRepo.findByMonth(cycle('2026-10'));
    expect(after?.entries[0]?.amount.actual?.cents).toBe(-42_000);
  });

  it('drops the line when a refund clears the invoice', async () => {
    const { useCase, cycleRepo } = managing({ cards: [inter()] });

    await useCase.registerPurchase({
      cardId: 'card-inter',
      description: 'Chair',
      purchasedOn: '2026-08-20',
      amountCents: -42_000,
    });
    await useCase.registerRefund({
      cardId: 'card-inter',
      description: 'Returned chair',
      purchasedOn: '2026-08-26',
      amountCents: 42_000,
    });

    expect((await cycleRepo.findByMonth(cycle('2026-10')))?.entries).toEqual(
      [],
    );
  });

  it('spreads instalments into the cycles that pay each one', async () => {
    const { useCase, cycleRepo } = managing({ cards: [inter()] });

    await useCase.registerPurchase({
      cardId: 'card-inter',
      description: 'Airfare',
      purchasedOn: '2026-08-20',
      amountCents: -120_000,
      installments: 3,
    });

    for (const month of ['2026-10', '2026-11', '2026-12']) {
      const stored = await cycleRepo.findByMonth(cycle(month));
      expect(stored?.entries[0]?.amount.planned.cents).toBe(-40_000);
    }
  });
});

describe('projecting into a closed cycle', () => {
  // A closed cycle is frozen. The invoice line it already carries records
  // what was settled, and a later purchase must not reach back into it.
  it('leaves a closed cycle alone', async () => {
    const september = Cycle.open({
      id: '2026-10',
      ref: cycle('2026-10'),
      openingBalance: Money.zero(),
    }).close();
    const { useCase, cycleRepo } = managing({
      cards: [inter()],
      cycles: [september],
    });

    await useCase.registerPurchase({
      cardId: 'card-inter',
      description: 'Mercado',
      purchasedOn: '2026-08-20',
      amountCents: -42_000,
    });

    expect((await cycleRepo.findByMonth(cycle('2026-10')))?.entries).toEqual(
      [],
    );
  });

  it('does nothing when a refund clears an invoice that never had a line', async () => {
    const { useCase, cycleRepo } = managing({ cards: [inter()] });

    await useCase.registerRefund({
      cardId: 'card-inter',
      description: 'Goodwill credit',
      purchasedOn: '2026-08-20',
      amountCents: 0,
    });

    expect((await cycleRepo.findByMonth(cycle('2026-10')))?.entries).toEqual(
      [],
    );
  });
});

describe('ManageCards identity', () => {
  // Production supplies no id generator; the default has to produce one.
  it('generates ids when none is supplied', async () => {
    const useCase = new ManageCards(
      new InMemoryCardRepository(),
      new InMemoryCycleRepository(),
      new InMemorySettingsRepository(anchor),
      noHolidays,
    );

    const card = await useCase.open({
      name: 'Nubank',
      limitCents: 800_000,
      closingDay: 3,
      dueDay: 10,
      paymentAccountId: 'acc-nubank',
    });

    expect(card.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

describe('a card due before payday', () => {
  // Payday is the 5th, so the August cycle runs 5 Aug – 3 Sep. A card due on
  // the 3rd is therefore paid by the cycle that opened the month before the
  // one its due date sits in.
  const dueThird = () =>
    Card.open({
      id: 'card-early',
      name: 'Early',
      limit: reais(5_000),
      closingDay: 20,
      dueDay: 3,
      paymentAccountId: 'acc-early',
    });

  it('pays a 3 Sep invoice out of the August cycle', async () => {
    const { useCase } = managing({ cards: [dueThird()] });

    const preview = await useCase.previewBilling('card-early', '2026-08-15');

    expect(preview.dueDate).toBe('2026-09-03');
    expect(preview.cycleMonth).toBe('2026-09');
  });

  it('reports the same cycle on the invoice it bills', async () => {
    const { useCase, cycleRepo } = managing({ cards: [dueThird()] });

    const card = await useCase.registerPurchase({
      cardId: 'card-early',
      description: 'Mercado',
      purchasedOn: '2026-08-15',
      amountCents: -20_000,
    });

    expect(card.invoices[0]?.paidInCycle).toBe('2026-09');
    expect(
      (
        await cycleRepo.findByMonth(cycle('2026-09'))
      )?.entries[0]?.dueDate.toISO(),
    ).toBe('2026-09-03');
  });
});

describe('ManageCards invoice lifecycle', () => {
  const withPurchase = async () => {
    const context = managing({ cards: [inter()] });
    await context.useCase.registerPurchase({
      cardId: 'card-inter',
      description: 'Mercado',
      purchasedOn: '2026-08-20',
      amountCents: -42_000,
    });
    return context;
  };

  it('closes an invoice', async () => {
    const { useCase } = await withPurchase();

    const card = await useCase.closeInvoice(
      'card-inter',
      'card-inter@2026-09-10',
    );

    expect(card.invoices[0]?.status).toBe(InvoiceStatus.Closed);
  });

  it('pays an invoice, recording what went out', async () => {
    const { useCase } = await withPurchase();

    await useCase.closeInvoice('card-inter', 'card-inter@2026-09-10');
    const card = await useCase.payInvoice(
      'card-inter',
      'card-inter@2026-09-10',
      -42_000,
    );

    expect(card.invoices[0]?.status).toBe(InvoiceStatus.Paid);
    expect(card.committedToFutureCents).toBe(0);
  });

  it('pays off the remaining instalments early, at a discount', async () => {
    const { useCase, cardRepo } = managing({ cards: [inter()] });

    await useCase.registerPurchase({
      cardId: 'card-inter',
      description: 'Airfare',
      purchasedOn: '2026-08-20',
      amountCents: -90_000,
      installments: 3,
    });
    const [plan] = (await cardRepo.findById('card-inter'))?.plans ?? [];

    const card = await useCase.payOffEarly(
      'card-inter',
      plan?.purchaseId ?? '',
      5_000,
    );

    expect(card.invoices[0]?.totalCents).toBe(-85_000);
    expect(card.invoices[1]?.totalCents).toBe(0);
  });
});

describe('ManageCards.open and delete', () => {
  it('opens a card', async () => {
    const { useCase } = managing();

    const card = await useCase.open({
      name: 'Nubank',
      limitCents: 800_000,
      closingDay: 3,
      dueDay: 10,
      paymentAccountId: 'acc-nubank',
    });

    expect(card.name).toBe('Nubank');
    expect(card.availableCents).toBe(800_000);
  });

  it('refuses an invalid card', async () => {
    const { useCase } = managing();

    await expect(
      useCase.open({
        name: '  ',
        limitCents: 1,
        closingDay: 3,
        dueDay: 10,
        paymentAccountId: 'a',
      }),
    ).rejects.toThrow();
  });

  it('lists what is stored', async () => {
    const { useCase } = managing({ cards: [inter()] });

    expect((await useCase.list()).map((c) => c.name)).toEqual(['Inter']);
  });

  it('deletes', async () => {
    const { useCase, cardRepo } = managing({ cards: [inter()] });

    await useCase.delete('card-inter');

    expect(await cardRepo.findAll()).toHaveLength(0);
  });

  it('refuses to delete a card that is not there', async () => {
    await expect(managing().useCase.delete('missing')).rejects.toThrow(
      CardNotFound,
    );
  });
});
