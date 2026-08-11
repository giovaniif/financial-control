import type {
  BillingPreviewResponse,
  CardResponse,
  OpenCardRequest,
  RegisterPurchaseRequest,
} from '@fin/contracts';
import type { FastifyInstance, FastifyReply } from 'fastify';

import type {
  CardView,
  ManageCards,
} from '../../../application/cards/uc-5-manage-cards.js';
import { CardNotFound } from '../../../application/cards/uc-5-manage-cards.js';
import { EntryNotInCycle } from '../../../domain/budgeting/cycle.js';
import { InvalidCard, PurchaseNotFound } from '../../../domain/cards/card.js';
import {
  InvalidInvoiceItem,
  InvoiceClosedError,
} from '../../../domain/cards/invoice.js';
import { InvalidDate } from '../../../domain/shared/local-date.js';
import { InvalidAmount } from '../../../domain/shared/money.js';

interface Dependencies {
  manageCards: ManageCards;
}

function asRecord(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null
    ? (body as Record<string, unknown>)
    : {};
}

function readOpen(body: unknown): OpenCardRequest | undefined {
  const { name, limit, closingDay, dueDay, paymentAccountId } = asRecord(body);

  if (
    typeof name !== 'string' ||
    typeof limit !== 'number' ||
    typeof closingDay !== 'number' ||
    typeof dueDay !== 'number' ||
    typeof paymentAccountId !== 'string'
  ) {
    return undefined;
  }
  return { name, limit, closingDay, dueDay, paymentAccountId };
}

function readPurchase(body: unknown): RegisterPurchaseRequest | undefined {
  const record = asRecord(body);
  const { description, purchasedOn, amount } = record;
  const installments = record['installments'];

  if (
    typeof description !== 'string' ||
    typeof purchasedOn !== 'string' ||
    typeof amount !== 'number'
  ) {
    return undefined;
  }
  return {
    description,
    purchasedOn,
    amount,
    ...(typeof installments === 'number' ? { installments } : {}),
  };
}

export function toResponse(view: CardView): CardResponse {
  return {
    id: view.id,
    name: view.name,
    limit: view.limitCents,
    closingDay: view.closingDay,
    dueDay: view.dueDay,
    paymentAccountId: view.paymentAccountId,
    committedToFuture: view.committedToFutureCents,
    available: view.availableCents,
    invoices: view.invoices.map((invoice) => ({
      id: invoice.id,
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      dueDate: invoice.dueDate,
      status: invoice.status,
      total: invoice.totalCents,
      paidInCycle: invoice.paidInCycle,
      items: invoice.items.map((item) => ({
        id: item.id,
        purchaseId: item.purchaseId,
        description: item.description,
        purchasedOn: item.purchasedOn,
        amount: item.amountCents,
        installment: item.installment ?? null,
        isRefund: item.isRefund,
      })),
    })),
  };
}

/** UC-5 — cards, their invoices, and the cycles that pay them. */
export function registerCardRoutes(
  app: FastifyInstance,
  { manageCards }: Dependencies,
): void {
  app.get('/cards', async (): Promise<CardResponse[]> => {
    const cards = await manageCards.list();
    return cards.map(toResponse);
  });

  app.post('/cards', async (request, reply) => {
    const input = readOpen(request.body);
    if (input === undefined) {
      return badRequest(
        reply,
        'name, limit, closingDay, dueDay and paymentAccountId are required.',
      );
    }

    try {
      const card = await manageCards.open({
        name: input.name,
        limitCents: input.limit,
        closingDay: input.closingDay,
        dueDay: input.dueDay,
        paymentAccountId: input.paymentAccountId,
      });
      return await reply.status(201).send(toResponse(card));
    } catch (error) {
      return handle(error, reply);
    }
  });

  app.get<{ Params: { id: string }; Querystring: { purchasedOn?: string } }>(
    '/cards/:id/billing-preview',
    async (request, reply) => {
      const { purchasedOn } = request.query;
      if (purchasedOn === undefined) {
        return badRequest(reply, 'purchasedOn is required.');
      }

      try {
        const preview: BillingPreviewResponse =
          await manageCards.previewBilling(request.params.id, purchasedOn);
        return preview;
      } catch (error) {
        return handle(error, reply);
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    '/cards/:id/purchases',
    async (request, reply) => {
      const input = readPurchase(request.body);
      if (input === undefined) {
        return badRequest(
          reply,
          'description, purchasedOn and amount are required.',
        );
      }

      try {
        const card = await manageCards.registerPurchase({
          cardId: request.params.id,
          description: input.description,
          purchasedOn: input.purchasedOn,
          amountCents: input.amount,
          ...(input.installments === undefined
            ? {}
            : { installments: input.installments }),
        });
        return await reply.status(201).send(toResponse(card));
      } catch (error) {
        return handle(error, reply);
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    '/cards/:id/refunds',
    async (request, reply) => {
      const input = readPurchase(request.body);
      if (input === undefined) {
        return badRequest(
          reply,
          'description, purchasedOn and amount are required.',
        );
      }

      try {
        const card = await manageCards.registerRefund({
          cardId: request.params.id,
          description: input.description,
          purchasedOn: input.purchasedOn,
          amountCents: input.amount,
        });
        return await reply.status(201).send(toResponse(card));
      } catch (error) {
        return handle(error, reply);
      }
    },
  );

  app.post<{ Params: { id: string; invoiceId: string } }>(
    '/cards/:id/invoices/:invoiceId/close',
    async (request, reply) => {
      try {
        return toResponse(
          await manageCards.closeInvoice(
            request.params.id,
            request.params.invoiceId,
          ),
        );
      } catch (error) {
        return handle(error, reply);
      }
    },
  );

  app.post<{ Params: { id: string; invoiceId: string } }>(
    '/cards/:id/invoices/:invoiceId/pay',
    async (request, reply) => {
      const { amount } = asRecord(request.body);
      if (typeof amount !== 'number') {
        return badRequest(reply, 'amount is required.');
      }

      try {
        return toResponse(
          await manageCards.payInvoice(
            request.params.id,
            request.params.invoiceId,
            amount,
          ),
        );
      } catch (error) {
        return handle(error, reply);
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    '/cards/:id/pay-off-early',
    async (request, reply) => {
      const { purchaseId, discount } = asRecord(request.body);
      if (typeof purchaseId !== 'string') {
        return badRequest(reply, 'purchaseId is required.');
      }

      try {
        return toResponse(
          await manageCards.payOffEarly(
            request.params.id,
            purchaseId,
            typeof discount === 'number' ? discount : 0,
          ),
        );
      } catch (error) {
        return handle(error, reply);
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/cards/:id',
    async (request, reply) => {
      try {
        await manageCards.delete(request.params.id);
        return await reply.status(204).send();
      } catch (error) {
        return handle(error, reply);
      }
    },
  );
}

function badRequest(reply: FastifyReply, message: string) {
  return reply.status(400).send({ error: message });
}

function handle(error: unknown, reply: FastifyReply) {
  if (error instanceof CardNotFound || error instanceof PurchaseNotFound) {
    return reply.status(404).send({ error: error.message });
  }
  if (error instanceof InvoiceClosedError) {
    return reply.status(409).send({ error: error.message });
  }
  if (
    error instanceof InvalidCard ||
    error instanceof InvalidInvoiceItem ||
    error instanceof InvalidAmount ||
    error instanceof InvalidDate ||
    error instanceof EntryNotInCycle
  ) {
    return badRequest(reply, error.message);
  }
  throw error;
}
