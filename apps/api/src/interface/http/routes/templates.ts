import type {
  ChangeTemplateAmountRequest,
  CreateTemplateRequest,
  TemplateResponse,
  TemplatesResponse,
} from '@fin/contracts';
import type { FastifyInstance, FastifyReply } from 'fastify';

import type {
  ManageTemplates,
  TemplateView,
} from '../../../application/budgeting/uc-2-manage-templates.js';
import { TemplateNotFound } from '../../../application/budgeting/uc-2-manage-templates.js';
import { InvalidTemplate } from '../../../domain/budgeting/recurring-template.js';
import { InvalidAmount } from '../../../domain/shared/money.js';

interface Dependencies {
  manageTemplates: ManageTemplates;
}

const DIRECTIONS = new Set(['IN', 'OUT']);
const SCOPES = new Set(['THIS_CYCLE_ONLY', 'THIS_AND_FUTURE']);

function asRecord(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null
    ? (body as Record<string, unknown>)
    : {};
}

function readCreate(body: unknown): CreateTemplateRequest | undefined {
  const record = asRecord(body);
  const { name, direction, dueDayOfMonth, amount } = record;

  if (
    typeof name !== 'string' ||
    typeof direction !== 'string' ||
    !DIRECTIONS.has(direction) ||
    typeof dueDayOfMonth !== 'number' ||
    typeof amount !== 'number'
  ) {
    return undefined;
  }

  const startMonth = record['startMonth'];
  const endMonth = record['endMonth'];
  const isEstimate = record['isEstimate'];

  return {
    name,
    direction: direction as CreateTemplateRequest['direction'],
    dueDayOfMonth,
    amount,
    ...(typeof startMonth === 'string' ? { startMonth } : {}),
    ...(typeof endMonth === 'string' ? { endMonth } : {}),
    ...(typeof isEstimate === 'boolean' ? { isEstimate } : {}),
  };
}

function readChange(body: unknown): ChangeTemplateAmountRequest | undefined {
  const { fromMonth, amount, scope } = asRecord(body);

  if (
    typeof fromMonth !== 'string' ||
    typeof amount !== 'number' ||
    typeof scope !== 'string' ||
    !SCOPES.has(scope)
  ) {
    return undefined;
  }
  return {
    fromMonth,
    amount,
    scope: scope as ChangeTemplateAmountRequest['scope'],
  };
}

export function toResponse(view: TemplateView): TemplateResponse {
  return {
    id: view.id,
    name: view.name,
    direction: view.direction,
    dueDayOfMonth: view.dueDayOfMonth,
    amount: view.amountCents,
    status: view.status,
    isEstimate: view.isEstimate,
    startMonth: view.startMonth,
    endMonth: view.endMonth ?? null,
    valueSchedule: view.valueSchedule.map((step) => ({
      fromMonth: step.fromMonth,
      amount: step.amountCents,
    })),
    nextOccurrenceMonth: view.nextOccurrenceMonth ?? null,
  };
}

/** UC-2 — the recurring commitments that fill every future cycle. */
export function registerTemplateRoutes(
  app: FastifyInstance,
  { manageTemplates }: Dependencies,
): void {
  app.get('/templates', async (): Promise<TemplatesResponse> => {
    const view = await manageTemplates.list();

    return {
      templates: view.templates.map(toResponse),
      summary: {
        fixedCommitment: view.summary.fixedCommitmentCents,
        activeOutcomeCount: view.summary.activeOutcomeCount,
        fixedIncome: view.summary.fixedIncomeCents,
        unconfirmedEstimates: view.summary.unconfirmedEstimatesCents,
        endingWithinTwelve: [...view.summary.endingWithinTwelve],
      },
    };
  });

  app.post('/templates', async (request, reply) => {
    const input = readCreate(request.body);
    if (input === undefined) {
      return badRequest(
        reply,
        'name, direction, dueDayOfMonth and amount are required.',
      );
    }

    try {
      const created = await manageTemplates.create({
        name: input.name,
        direction: input.direction,
        dueDayOfMonth: input.dueDayOfMonth,
        amountCents: input.amount,
        ...(input.startMonth === undefined
          ? {}
          : { startMonth: input.startMonth }),
        ...(input.endMonth === undefined ? {} : { endMonth: input.endMonth }),
        ...(input.isEstimate === undefined
          ? {}
          : { isEstimate: input.isEstimate }),
      });
      return await reply.status(201).send(toResponse(created));
    } catch (error) {
      return handle(error, reply);
    }
  });

  app.patch<{ Params: { id: string } }>(
    '/templates/:id/amount',
    async (request, reply) => {
      const input = readChange(request.body);
      if (input === undefined) {
        return badRequest(reply, 'fromMonth, amount e scope são obrigatórios.');
      }

      try {
        return toResponse(
          await manageTemplates.changeAmount({
            templateId: request.params.id,
            fromMonth: input.fromMonth,
            amountCents: input.amount,
            scope: input.scope,
          }),
        );
      } catch (error) {
        return handle(error, reply);
      }
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/templates/:id',
    async (request, reply) => {
      const record = asRecord(request.body);
      const name = record['name'];
      const status = record['status'];
      const endMonth = record['endMonth'];
      const isEstimate = record['isEstimate'];

      try {
        let view: TemplateView | undefined;
        if (typeof name === 'string') {
          view = await manageTemplates.rename(request.params.id, name);
        }
        if (status === 'PAUSED') {
          view = await manageTemplates.pause(request.params.id);
        }
        if (status === 'ACTIVE') {
          view = await manageTemplates.resume(request.params.id);
        }
        if (typeof endMonth === 'string') {
          view = await manageTemplates.endOn(request.params.id, endMonth);
        }
        if (typeof isEstimate === 'boolean') {
          view = await manageTemplates.flagAsEstimate(
            request.params.id,
            isEstimate,
          );
        }

        if (view === undefined) {
          return await badRequest(
            reply,
            'É preciso informar name, status, endMonth ou isEstimate.',
          );
        }
        return toResponse(view);
      } catch (error) {
        return handle(error, reply);
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/templates/:id',
    async (request, reply) => {
      try {
        await manageTemplates.delete(request.params.id);
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
  if (error instanceof TemplateNotFound) {
    return reply.status(404).send({ error: error.message });
  }
  if (error instanceof InvalidTemplate || error instanceof InvalidAmount) {
    return badRequest(reply, error.message);
  }
  throw error;
}
