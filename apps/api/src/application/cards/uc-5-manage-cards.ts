import type { PaydayAnchor } from '../../domain/budgeting/cycle-ref.js';
import { CycleRef } from '../../domain/budgeting/cycle-ref.js';
import { Cycle } from '../../domain/budgeting/cycle.js';
import {
  EntryKind,
  LedgerEntry,
  Origin,
} from '../../domain/budgeting/ledger-entry.js';
import type { Card } from '../../domain/cards/card.js';
import { Card as CardAggregate } from '../../domain/cards/card.js';
import type { Invoice } from '../../domain/cards/invoice.js';
import { InvoiceStatus } from '../../domain/cards/invoice.js';
import type { HolidayCalendar } from '../../domain/ports/holiday-calendar.js';
import type {
  CardRepository,
  CycleRepository,
  SettingsRepository,
} from '../../domain/ports/repositories.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import { LocalDate } from '../../domain/shared/local-date.js';
import { Money } from '../../domain/shared/money.js';
import { calendarMonthOf } from '../budgeting/month.js';

export class CardNotFound extends DomainError {}

export interface InvoiceItemView {
  readonly id: string;
  readonly purchaseId: string;
  readonly description: string;
  readonly purchasedOn: string;
  readonly amountCents: number;
  readonly installment: string | undefined;
  readonly isRefund: boolean;
}

export interface InvoiceView {
  readonly id: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly dueDate: string;
  readonly status: InvoiceStatus;
  readonly totalCents: number;
  /** The cycle that pays it: the one containing its due date. */
  readonly paidInCycle: string;
  readonly items: readonly InvoiceItemView[];
}

export interface CardView {
  readonly id: string;
  readonly name: string;
  readonly limitCents: number;
  readonly closingDay: number;
  readonly dueDay: number;
  readonly paymentAccountId: string;
  readonly committedToFutureCents: number;
  readonly availableCents: number;
  readonly invoices: readonly InvoiceView[];
}

/** What the purchase form shows live, before anything is saved. */
export interface BillingPreview {
  readonly dueDate: string;
  readonly cycleMonth: string;
  readonly cycleLabel: string;
}

/** UC-5 — cards, their invoices, and the cycles that pay them. */
export class ManageCards {
  constructor(
    private readonly cards: CardRepository,
    private readonly cycles: CycleRepository,
    private readonly settings: SettingsRepository,
    private readonly holidays: HolidayCalendar,
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  async list(): Promise<readonly CardView[]> {
    const cards = await this.cards.findAll();
    const anchor = await this.settings.load();

    return cards.map((card) => this.toView(card, anchor));
  }

  async open(input: {
    name: string;
    limitCents: number;
    closingDay: number;
    dueDay: number;
    paymentAccountId: string;
  }): Promise<CardView> {
    const card = CardAggregate.open({
      id: this.newId(),
      name: input.name,
      limit: Money.fromCents(input.limitCents),
      closingDay: input.closingDay,
      dueDay: input.dueDay,
      paymentAccountId: input.paymentAccountId,
    });

    await this.cards.save(card);
    return this.toView(card, await this.settings.load());
  }

  /**
   * *"This will be billed 10 Sep, in the September cycle."* Computed without
   * saving anything, because the surprise it prevents is the whole point.
   */
  async previewBilling(
    cardId: string,
    purchasedOn: string,
  ): Promise<BillingPreview> {
    const card = await this.require(cardId);
    const { dueDate } = card.periodFor(LocalDate.parse(purchasedOn));
    const ref = await this.cycleContaining(dueDate);

    return {
      dueDate: dueDate.toISO(),
      cycleMonth: ref.month,
      cycleLabel: ref.label,
    };
  }

  async registerPurchase(input: {
    cardId: string;
    description: string;
    purchasedOn: string;
    amountCents: number;
    installments?: number;
  }): Promise<CardView> {
    const card = await this.require(input.cardId);
    const purchaseId = this.newId();

    const updated = card.registerPurchase({
      purchaseId,
      description: input.description,
      purchasedOn: LocalDate.parse(input.purchasedOn),
      amount: Money.fromCents(input.amountCents),
      ...(input.installments === undefined
        ? {}
        : { installments: input.installments }),
      newInvoiceId: (dueDate) => `${input.cardId}@${dueDate.toISO()}`,
      newItemId: (id, position) => `${id}-${String(position)}`,
    });

    return this.saveAndProject(updated);
  }

  /** A returned item or a chargeback, reducing the invoice it lands on. */
  async registerRefund(input: {
    cardId: string;
    description: string;
    purchasedOn: string;
    amountCents: number;
  }): Promise<CardView> {
    return this.registerPurchase({
      ...input,
      amountCents: Math.abs(input.amountCents),
    });
  }

  async payOffEarly(
    cardId: string,
    purchaseId: string,
    discountCents = 0,
  ): Promise<CardView> {
    const card = await this.require(cardId);

    return this.saveAndProject(
      card.payOffEarly({
        purchaseId,
        discount: Money.fromCents(discountCents),
        newItemId: (id, position) => `${id}-early-${String(position)}`,
      }),
    );
  }

  async closeInvoice(cardId: string, invoiceId: string): Promise<CardView> {
    const card = await this.require(cardId);

    return this.saveAndProject(card.closeInvoice(invoiceId));
  }

  async payInvoice(
    cardId: string,
    invoiceId: string,
    amountCents: number,
  ): Promise<CardView> {
    const card = await this.require(cardId);

    return this.saveAndProject(
      card.payInvoice(invoiceId, Money.fromCents(amountCents)),
    );
  }

  async delete(cardId: string): Promise<void> {
    await this.require(cardId);
    await this.cards.delete(cardId);
  }

  /**
   * Saves the card and mirrors every invoice into the cycle that pays it.
   *
   * This is the seam between Cards and Budgeting: an invoice appears in the
   * ledger as a single outcome on its due date, keyed by the invoice, so
   * re-running only updates the amount rather than adding a second line.
   */
  private async saveAndProject(card: Card): Promise<CardView> {
    await this.cards.save(card);
    const anchor = await this.settings.load();

    for (const invoice of card.invoices) {
      await this.projectInvoice(card, invoice);
    }

    return this.toView(card, anchor);
  }

  private async projectInvoice(card: Card, invoice: Invoice): Promise<void> {
    const ref = await this.cycleContaining(invoice.dueDate);
    const cycle =
      (await this.cycles.findByMonth(ref)) ??
      Cycle.open({ id: ref.month, ref, openingBalance: Money.zero() });

    if (cycle.isClosed) {
      return;
    }

    const existing = cycle.entries.find((entry) =>
      billsInvoice(entry, invoice.id),
    );
    const description = `${card.name} — invoice`;

    // A cleared invoice has nothing to pay, so its line comes out rather than
    // sitting in the chain as a zero.
    if (invoice.total.isZero()) {
      await this.cycles.save(
        existing === undefined ? cycle : cycle.removeEntry(existing.id),
      );
      return;
    }

    if (existing !== undefined) {
      // Leave a settled line alone: it records what was actually paid.
      if (existing.isSettled) {
        return;
      }
      await this.cycles.save(
        cycle
          .removeEntry(existing.id)
          .addEntry(this.invoiceEntry(existing.id, description, invoice)),
      );
      return;
    }

    await this.cycles.save(
      cycle.addEntry(
        this.invoiceEntry(`invoice-${invoice.id}`, description, invoice),
      ),
    );
  }

  private invoiceEntry(
    id: string,
    description: string,
    invoice: Invoice,
  ): LedgerEntry {
    return LedgerEntry.create({
      id,
      description,
      kind: EntryKind.Invoice,
      dueDate: invoice.dueDate,
      planned: invoice.total,
      origin: Origin.fromInvoice(invoice.id),
    });
  }

  private async cycleContaining(date: LocalDate): Promise<CycleRef> {
    return this.cycleFor(date, await this.settings.load());
  }

  /**
   * The cycle containing a date is not always the one named for its month: a
   * card due on the 3rd, with payday on the 5th, is paid by the cycle that
   * opened the month before.
   */
  private cycleFor(date: LocalDate, anchor: PaydayAnchor): CycleRef {
    const ref = CycleRef.forMonth(calendarMonthOf(date), anchor, this.holidays);

    return ref.contains(date) ? ref : ref.previous();
  }

  private async require(cardId: string): Promise<Card> {
    const card = await this.cards.findById(cardId);
    if (card === undefined) {
      throw new CardNotFound(`No card ${cardId}.`);
    }
    return card;
  }

  private toView(
    card: Card,
    anchor: Parameters<typeof CycleRef.forMonth>[1],
  ): CardView {
    return {
      id: card.id,
      name: card.name,
      limitCents: card.limit.cents,
      closingDay: card.closingDay,
      dueDay: card.dueDay,
      paymentAccountId: card.paymentAccountId,
      committedToFutureCents: card.committedToFutureInvoices.cents,
      availableCents: card.availableLimit.cents,
      invoices: card.invoices.map((invoice) => {
        const paying = this.cycleFor(invoice.dueDate, anchor);

        return {
          id: invoice.id,
          periodStart: invoice.periodStart.toISO(),
          periodEnd: invoice.periodEnd.toISO(),
          dueDate: invoice.dueDate.toISO(),
          status: invoice.status,
          totalCents: invoice.total.cents,
          paidInCycle: paying.month,
          items: invoice.items.map((item) => ({
            id: item.id,
            purchaseId: item.purchaseId,
            description: item.description,
            purchasedOn: item.purchasedOn.toISO(),
            amountCents: item.amount.cents,
            installment: item.installment?.toString(),
            isRefund: item.amount.isPositive(),
          })),
        };
      }),
    };
  }
}

export { InvoiceStatus };

/** Looks through an override, as an overridden invoice line is still one. */
function billsInvoice(entry: LedgerEntry, invoiceId: string): boolean {
  const origin =
    entry.origin.kind === 'OVERRIDE' ? entry.origin.original : entry.origin;

  return origin.kind === 'FROM_INVOICE' && origin.invoiceId === invoiceId;
}
