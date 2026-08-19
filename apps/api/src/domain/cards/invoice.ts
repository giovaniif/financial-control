import { DateRange } from '../shared/date-range.js';
import { DomainError } from '../shared/domain-error.js';
import type { InstallmentRef } from '../shared/installment-ref.js';
import type { LocalDate } from '../shared/local-date.js';
import { Money } from '../shared/money.js';

export class InvoiceClosedError extends DomainError {}
export class InvalidInvoiceItem extends DomainError {}

export const InvoiceStatus = {
  Open: 'OPEN',
  Closed: 'CLOSED',
  Paid: 'PAID',
} as const;

export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

/** How a status reads on screen. Agrees with `fatura`, which is feminine. */
const STATUS_LABELS: Record<InvoiceStatus, string> = {
  OPEN: 'aberta',
  CLOSED: 'fechada',
  PAID: 'paga',
};

export interface InvoiceItem {
  readonly id: string;
  readonly purchaseId: string;
  readonly description: string;
  readonly purchasedOn: LocalDate;
  /** Negative for an outgoing purchase; positive for a refund. */
  readonly amount: Money;
  readonly installment: InstallmentRef | undefined;
}

interface InvoiceState {
  readonly id: string;
  readonly periodStart: LocalDate;
  readonly periodEnd: LocalDate;
  /** What decides which cycle pays this invoice. */
  readonly dueDate: LocalDate;
  readonly status: InvoiceStatus;
  readonly items: readonly InvoiceItem[];
  readonly paidAmount: Money | undefined;
}

/**
 * One billing period on a card.
 *
 * Its **due date** is what assigns it to a cycle — never the dates of the
 * purchases on it. That is the whole of UC-5.4, and the reason a purchase made
 * one day after closing is paid a whole cycle later.
 */
export class Invoice {
  private constructor(private readonly state: InvoiceState) {}

  static open(input: {
    id: string;
    periodStart: LocalDate;
    periodEnd: LocalDate;
    dueDate: LocalDate;
    items?: readonly InvoiceItem[];
    status?: InvoiceStatus;
    paidAmount?: Money;
  }): Invoice {
    return new Invoice({
      id: input.id,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      dueDate: input.dueDate,
      status: input.status ?? InvoiceStatus.Open,
      items: input.items ?? [],
      paidAmount: input.paidAmount,
    });
  }

  get id(): string {
    return this.state.id;
  }

  get period(): DateRange {
    return DateRange.of(this.state.periodStart, this.state.periodEnd);
  }

  get periodStart(): LocalDate {
    return this.state.periodStart;
  }

  get periodEnd(): LocalDate {
    return this.state.periodEnd;
  }

  /** Drives cycle assignment. See UC-5.4. */
  get dueDate(): LocalDate {
    return this.state.dueDate;
  }

  get status(): InvoiceStatus {
    return this.state.status;
  }

  get items(): readonly InvoiceItem[] {
    return this.state.items;
  }

  get paidAmount(): Money | undefined {
    return this.state.paidAmount;
  }

  get isOpen(): boolean {
    return this.state.status === InvoiceStatus.Open;
  }

  /** Negative: an invoice is money going out, and refunds offset it. */
  get total(): Money {
    return Money.sum(this.state.items.map((item) => item.amount));
  }

  covers(purchasedOn: LocalDate): boolean {
    return this.period.contains(purchasedOn);
  }

  addItem(item: InvoiceItem): Invoice {
    if (!this.isOpen) {
      throw new InvoiceClosedError(
        `A fatura com vencimento em ${this.state.dueDate.toISO()} está ${STATUS_LABELS[this.state.status]}; ela não aceita novos itens.`,
      );
    }
    if (!this.covers(item.purchasedOn)) {
      throw new InvalidInvoiceItem(
        `Uma compra em ${item.purchasedOn.toISO()} fica fora do período ${this.period.toString()}.`,
      );
    }
    return this.with({ items: [...this.state.items, item] });
  }

  removeItemsOfPurchase(purchaseId: string): Invoice {
    if (!this.isOpen) {
      throw new InvoiceClosedError(
        `A fatura com vencimento em ${this.state.dueDate.toISO()} está ${STATUS_LABELS[this.state.status]}; os itens dela não mudam mais.`,
      );
    }
    return this.with({
      items: this.state.items.filter((item) => item.purchaseId !== purchaseId),
    });
  }

  close(): Invoice {
    if (!this.isOpen) {
      return this;
    }
    return this.with({ status: InvoiceStatus.Closed });
  }

  /** Settles the invoice from its card's payment account. */
  pay(amount: Money): Invoice {
    if (this.state.status === InvoiceStatus.Paid) {
      throw new InvoiceClosedError(
        `A fatura com vencimento em ${this.state.dueDate.toISO()} já foi paga.`,
      );
    }
    return this.with({ status: InvoiceStatus.Paid, paidAmount: amount });
  }

  private with(changes: Partial<InvoiceState>): Invoice {
    return new Invoice({ ...this.state, ...changes });
  }
}
