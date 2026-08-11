import type {
  Card as CardRow,
  InstallmentPlan as PlanRow,
  Invoice as InvoiceRow,
  InvoiceItem as ItemRow,
} from '@prisma/client';

import { Card } from '../../../domain/cards/card.js';
import { Invoice } from '../../../domain/cards/invoice.js';
import { InstallmentRef } from '../../../domain/shared/installment-ref.js';
import { LocalDate } from '../../../domain/shared/local-date.js';
import { Money } from '../../../domain/shared/money.js';

type Row = CardRow & {
  invoices: (InvoiceRow & { items: ItemRow[] })[];
  plans: PlanRow[];
};

/** A calendar day crosses to Prisma as UTC midnight, so it cannot drift. */
const toDb = (date: LocalDate) => new Date(`${date.toISO()}T00:00:00.000Z`);

export function toCard(row: Row): Card {
  return Card.open({
    id: row.id,
    name: row.name,
    limit: Money.fromCents(Number(row.limitCents)),
    closingDay: row.closingDay,
    dueDay: row.dueDay,
    paymentAccountId: row.paymentAccountId,
    invoices: row.invoices.map((invoice) =>
      Invoice.open({
        id: invoice.id,
        periodStart: LocalDate.fromInstant(invoice.periodStart),
        periodEnd: LocalDate.fromInstant(invoice.periodEnd),
        dueDate: LocalDate.fromInstant(invoice.dueDate),
        status: invoice.status,
        ...(invoice.paidCents === null
          ? {}
          : { paidAmount: Money.fromCents(Number(invoice.paidCents)) }),
        items: invoice.items.map((item) => ({
          id: item.id,
          purchaseId: item.purchaseId,
          description: item.description,
          purchasedOn: LocalDate.fromInstant(item.purchasedOn),
          amount: Money.fromCents(Number(item.amountCents)),
          installment:
            item.installmentNumber === null || item.installmentTotal === null
              ? undefined
              : InstallmentRef.of(
                  item.installmentNumber,
                  item.installmentTotal,
                ),
        })),
      }),
    ),
    plans: row.plans.map((plan) => ({
      purchaseId: plan.purchaseId,
      description: plan.description,
      purchasedOn: LocalDate.fromInstant(plan.purchasedOn),
      total: Money.fromCents(Number(plan.totalCents)),
      totalInstallments: plan.totalInstallments,
    })),
  });
}

export function fromCard(card: Card): {
  header: Omit<CardRow, 'createdAt' | 'updatedAt'>;
  invoices: Omit<InvoiceRow, 'createdAt' | 'updatedAt'>[];
  items: ItemRow[];
  plans: PlanRow[];
} {
  return {
    header: {
      id: card.id,
      name: card.name,
      limitCents: BigInt(card.limit.cents),
      closingDay: card.closingDay,
      dueDay: card.dueDay,
      paymentAccountId: card.paymentAccountId,
    },
    invoices: card.invoices.map((invoice) => ({
      id: invoice.id,
      cardId: card.id,
      periodStart: toDb(invoice.periodStart),
      periodEnd: toDb(invoice.periodEnd),
      dueDate: toDb(invoice.dueDate),
      status: invoice.status,
      paidCents:
        invoice.paidAmount === undefined
          ? null
          : BigInt(invoice.paidAmount.cents),
    })),
    items: card.invoices.flatMap((invoice) =>
      invoice.items.map((item) => ({
        id: item.id,
        invoiceId: invoice.id,
        purchaseId: item.purchaseId,
        description: item.description,
        purchasedOn: toDb(item.purchasedOn),
        amountCents: BigInt(item.amount.cents),
        installmentNumber: item.installment?.number ?? null,
        installmentTotal: item.installment?.total ?? null,
      })),
    ),
    plans: card.plans.map((plan) => ({
      purchaseId: plan.purchaseId,
      cardId: card.id,
      description: plan.description,
      purchasedOn: toDb(plan.purchasedOn),
      totalCents: BigInt(plan.total.cents),
      totalInstallments: plan.totalInstallments,
    })),
  };
}
