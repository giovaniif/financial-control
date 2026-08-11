import { DomainError } from '../shared/domain-error.js';
import { InstallmentRef } from '../shared/installment-ref.js';
import { LocalDate } from '../shared/local-date.js';
import { Money } from '../shared/money.js';
import { Invoice, InvoiceStatus } from './invoice.js';

export class InvalidCard extends DomainError {}
export class PurchaseNotFound extends DomainError {}

/** One purchase, possibly spread across several invoices. */
export interface InstallmentPlan {
  readonly purchaseId: string;
  readonly description: string;
  readonly purchasedOn: LocalDate;
  readonly total: Money;
  readonly totalInstallments: number;
}

interface CardState {
  readonly id: string;
  readonly name: string;
  readonly limit: Money;
  readonly closingDay: number;
  readonly dueDay: number;
  readonly paymentAccountId: string;
  readonly invoices: readonly Invoice[];
  readonly plans: readonly InstallmentPlan[];
}

/**
 * A credit card: its billing days, its invoices, and the instalment plans
 * spread across them.
 *
 * The closing and due days are what drive everything downstream. A purchase
 * falls on the invoice whose period contains it; that invoice is then paid in
 * the cycle containing its **due date**, which is frequently not the cycle the
 * purchase was made in.
 */
export class Card {
  private constructor(private readonly state: CardState) {}

  static open(input: {
    id: string;
    name: string;
    limit: Money;
    closingDay: number;
    dueDay: number;
    paymentAccountId: string;
    invoices?: readonly Invoice[];
    plans?: readonly InstallmentPlan[];
  }): Card {
    if (input.name.trim() === '') {
      throw new InvalidCard('A card needs a name.');
    }
    if (input.limit.isNegative()) {
      throw new InvalidCard('A card limit cannot be negative.');
    }
    for (const [label, day] of [
      ['closing', input.closingDay],
      ['due', input.dueDay],
    ] as const) {
      if (!Number.isSafeInteger(day) || day < 1 || day > 31) {
        throw new InvalidCard(
          `A ${label} day is a day of the month; received ${String(day)}.`,
        );
      }
    }

    return new Card({
      id: input.id,
      name: input.name.trim(),
      limit: input.limit,
      closingDay: input.closingDay,
      dueDay: input.dueDay,
      paymentAccountId: input.paymentAccountId,
      invoices: input.invoices ?? [],
      plans: input.plans ?? [],
    });
  }

  get id(): string {
    return this.state.id;
  }

  get name(): string {
    return this.state.name;
  }

  get limit(): Money {
    return this.state.limit;
  }

  get closingDay(): number {
    return this.state.closingDay;
  }

  get dueDay(): number {
    return this.state.dueDay;
  }

  get paymentAccountId(): string {
    return this.state.paymentAccountId;
  }

  get invoices(): readonly Invoice[] {
    return [...this.state.invoices].sort((a, b) =>
      LocalDate.compare(a.dueDate, b.dueDate),
    );
  }

  get plans(): readonly InstallmentPlan[] {
    return this.state.plans;
  }

  /**
   * The billing period a purchase falls in, and when that invoice is due.
   *
   * The period ends on the closing day and starts the day after the previous
   * one. The due day is read as the first such day strictly after closing, so
   * a card closing on the 28th and due on the 10th bills into the next month,
   * while one closing on the 3rd and due on the 10th bills into the same one.
   */
  periodFor(purchasedOn: LocalDate): {
    start: LocalDate;
    end: LocalDate;
    dueDate: LocalDate;
  } {
    const closingThisMonth = this.dayIn(
      purchasedOn.year,
      purchasedOn.month,
      this.state.closingDay,
    );
    const end = purchasedOn.isAfter(closingThisMonth)
      ? this.closingAfter(closingThisMonth)
      : closingThisMonth;
    const start = this.previousClosing(end).plusDays(1);

    return { start, end, dueDate: this.dueAfter(end) };
  }

  /** Registers a purchase, splitting it across `installments` invoices. */
  registerPurchase(input: {
    purchaseId: string;
    description: string;
    purchasedOn: LocalDate;
    amount: Money;
    installments?: number;
    newInvoiceId: (dueDate: LocalDate) => string;
    newItemId: (purchaseId: string, position: number) => string;
  }): Card {
    const count = input.installments ?? 1;
    if (!Number.isSafeInteger(count) || count < 1) {
      throw new InvalidCard(
        `A purchase is split into at least one instalment; received ${String(count)}.`,
      );
    }
    if (input.description.trim() === '') {
      throw new InvalidCard('A purchase needs a description.');
    }

    // dividedInto gives the remainder to the last part, so the instalments
    // always bill exactly what was purchased.
    const parts = input.amount.dividedInto(count);
    let period = this.periodFor(input.purchasedOn);

    const card = parts.reduce<Card>((building, part, index) => {
      const { card: withInvoice, invoice } = building.invoiceDue(
        period,
        input.newInvoiceId,
      );
      const billed = withInvoice.replaceInvoice(
        invoice.addItem({
          id: input.newItemId(input.purchaseId, index + 1),
          purchaseId: input.purchaseId,
          description: input.description.trim(),
          // Later instalments belong to later periods, so they are dated into
          // the period that bills them rather than the day of purchase.
          purchasedOn: index === 0 ? input.purchasedOn : period.start,
          amount: part,
          installment:
            count === 1 ? undefined : InstallmentRef.of(index + 1, count),
        }),
      );

      period = this.periodFor(period.end.plusDays(1));
      return billed;
    }, this);

    return count === 1
      ? card
      : card.with({
          plans: [
            ...card.state.plans,
            {
              purchaseId: input.purchaseId,
              description: input.description.trim(),
              purchasedOn: input.purchasedOn,
              total: input.amount,
              totalInstallments: count,
            },
          ],
        });
  }

  /**
   * Brings the remaining instalments of a purchase onto the earliest open
   * invoice, optionally at a discount. Anything already billed stays billed.
   */
  payOffEarly(input: {
    purchaseId: string;
    discount?: Money;
    newItemId: (purchaseId: string, position: number) => string;
  }): Card {
    const plan = this.state.plans.find(
      (candidate) => candidate.purchaseId === input.purchaseId,
    );
    if (plan === undefined) {
      throw new PurchaseNotFound(`No instalment plan ${input.purchaseId}.`);
    }

    const outstanding = this.state.invoices.filter(
      (invoice) =>
        invoice.isOpen &&
        invoice.items.some((item) => item.purchaseId === input.purchaseId),
    );
    if (outstanding.length === 0) {
      return this;
    }

    const remaining = Money.sum(
      outstanding.flatMap((invoice) =>
        invoice.items
          .filter((item) => item.purchaseId === input.purchaseId)
          .map((item) => item.amount),
      ),
    );
    const settled = remaining.plus(input.discount ?? Money.zero());
    const [earliest] = outstanding;
    if (earliest === undefined) {
      return this;
    }

    const cleared = outstanding.reduce<Card>(
      (card, invoice) =>
        card.replaceInvoice(invoice.removeItemsOfPurchase(input.purchaseId)),
      this,
    );
    const target = cleared.state.invoices.find(
      (invoice) => invoice.id === earliest.id,
    );
    if (target === undefined) {
      return cleared;
    }

    return cleared
      .replaceInvoice(
        target.addItem({
          id: input.newItemId(input.purchaseId, 0),
          purchaseId: input.purchaseId,
          description: `${plan.description} — paid off early`,
          purchasedOn: target.periodStart,
          amount: settled,
          installment: undefined,
        }),
      )
      .with({
        plans: cleared.state.plans.filter(
          (candidate) => candidate.purchaseId !== input.purchaseId,
        ),
      });
  }

  closeInvoice(invoiceId: string): Card {
    return this.mapInvoice(invoiceId, (invoice) => invoice.close());
  }

  payInvoice(invoiceId: string, amount: Money): Card {
    return this.mapInvoice(invoiceId, (invoice) => invoice.pay(amount));
  }

  /** The invoice currently taking purchases, if one has been opened. */
  openInvoiceOn(date: LocalDate): Invoice | undefined {
    return this.state.invoices.find(
      (invoice) => invoice.isOpen && invoice.covers(date),
    );
  }

  invoiceById(invoiceId: string): Invoice | undefined {
    return this.state.invoices.find((invoice) => invoice.id === invoiceId);
  }

  /**
   * What is already owed on invoices that have not been paid — the figure the
   * spreadsheet could not produce.
   */
  get committedToFutureInvoices(): Money {
    return Money.sum(
      this.state.invoices
        .filter((invoice) => invoice.status !== InvoiceStatus.Paid)
        .map((invoice) => invoice.total),
    ).abs();
  }

  get availableLimit(): Money {
    return this.state.limit.minus(this.committedToFutureInvoices);
  }

  private invoiceDue(
    period: { start: LocalDate; end: LocalDate; dueDate: LocalDate },
    newInvoiceId: (dueDate: LocalDate) => string,
  ): { card: Card; invoice: Invoice } {
    const existing = this.state.invoices.find((invoice) =>
      invoice.dueDate.equals(period.dueDate),
    );
    if (existing !== undefined) {
      return { card: this, invoice: existing };
    }

    const invoice = Invoice.open({
      id: newInvoiceId(period.dueDate),
      periodStart: period.start,
      periodEnd: period.end,
      dueDate: period.dueDate,
    });

    return {
      card: this.with({ invoices: [...this.state.invoices, invoice] }),
      invoice,
    };
  }

  private replaceInvoice(invoice: Invoice): Card {
    return this.with({
      invoices: this.state.invoices.map((candidate) =>
        candidate.id === invoice.id ? invoice : candidate,
      ),
    });
  }

  private mapInvoice(
    invoiceId: string,
    change: (invoice: Invoice) => Invoice,
  ): Card {
    const invoice = this.invoiceById(invoiceId);
    if (invoice === undefined) {
      throw new PurchaseNotFound(
        `No invoice ${invoiceId} on ${this.state.name}.`,
      );
    }
    return this.replaceInvoice(change(invoice));
  }

  /** Clamps a day onto a short month, as every other day-of-month does here. */
  private dayIn(year: number, month: number, day: number): LocalDate {
    return LocalDate.of(
      year,
      month,
      Math.min(day, LocalDate.lastDayOfMonth(year, month)),
    );
  }

  private closingAfter(closing: LocalDate): LocalDate {
    const next = closing.plusMonths(1);
    return this.dayIn(next.year, next.month, this.state.closingDay);
  }

  private previousClosing(closing: LocalDate): LocalDate {
    const previous = closing.plusMonths(-1);
    return this.dayIn(previous.year, previous.month, this.state.closingDay);
  }

  /** The first due day strictly after the period closes. */
  private dueAfter(closing: LocalDate): LocalDate {
    const sameMonth = this.dayIn(
      closing.year,
      closing.month,
      this.state.dueDay,
    );
    if (sameMonth.isAfter(closing)) {
      return sameMonth;
    }
    const next = closing.plusMonths(1);
    return this.dayIn(next.year, next.month, this.state.dueDay);
  }

  private with(changes: Partial<CardState>): Card {
    return new Card({ ...this.state, ...changes });
  }
}
