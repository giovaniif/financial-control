import type { Cents } from './money.js';

export type InvoiceStatus = 'OPEN' | 'CLOSED' | 'PAID';

export interface InvoiceItemResponse {
  id: string;
  /** One purchase spans one item per invoice; paying off early acts on this. */
  purchaseId: string;
  description: string;
  purchasedOn: string;
  amount: Cents;
  /** `3/10` when the item is one instalment of a plan. */
  installment: string | null;
  isRefund: boolean;
}

export interface InvoiceResponse {
  id: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  status: InvoiceStatus;
  total: Cents;
  /** The cycle that pays it: the one containing its due date, not its items'. */
  paidInCycle: string;
  items: InvoiceItemResponse[];
}

export interface CardResponse {
  id: string;
  name: string;
  limit: Cents;
  closingDay: number;
  dueDay: number;
  paymentAccountId: string;
  /** What the spreadsheet could not produce: already owed on future invoices. */
  committedToFuture: Cents;
  available: Cents;
  invoices: InvoiceResponse[];
}

export interface OpenCardRequest {
  name: string;
  limit: Cents;
  closingDay: number;
  dueDay: number;
  paymentAccountId: string;
}

export interface RegisterPurchaseRequest {
  description: string;
  purchasedOn: string;
  amount: Cents;
  installments?: number;
}

/** "This will be billed 10 Sep, in the September cycle." */
export interface BillingPreviewResponse {
  dueDate: string;
  cycleMonth: string;
  cycleLabel: string;
}

export interface PayInvoiceRequest {
  amount: Cents;
}

export interface PayOffEarlyRequest {
  purchaseId: string;
  discount?: Cents;
}
