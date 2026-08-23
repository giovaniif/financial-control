import type {
  AddEntryRequest,
  ReopenPreviewResponse,
  SettleEntryRequest,
} from '@fin/contracts';
import type { FastifyInstance, FastifyReply } from 'fastify';

import type { CloseCycle } from '../../../application/budgeting/uc-3-8-close-cycle.js';
import { CycleNotOverYet } from '../../../application/budgeting/uc-3-8-close-cycle.js';
import type { LedgerActions } from '../../../application/budgeting/uc-3-ledger-actions.js';
import { CycleNotFound } from '../../../application/budgeting/uc-3-ledger-actions.js';
import { InvalidAnchor } from '../../../domain/budgeting/cycle-ref.js';
import {
  CycleClosed,
  CycleNotSettled,
  EntryNotFound,
  EntryNotInCycle,
} from '../../../domain/budgeting/cycle.js';
import { InvalidEntry } from '../../../domain/budgeting/ledger-entry.js';
import { InvalidDate } from '../../../domain/shared/local-date.js';
import { InvalidAmount } from '../../../domain/shared/money.js';
import { InvalidSettlement } from '../../../domain/shared/planned-actual.js';

interface Dependencies {
  ledgerActions: LedgerActions;
  closeCycle: CloseCycle;
}

const KINDS = new Set(['INCOME', 'FIXED', 'INVOICE', 'VARIABLE', 'ALLOCATION']);
const SETTLE_STATUSES = new Set(['PAID', 'RECEIVED', 'SKIPPED']);

function asRecord(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null
    ? (body as Record<string, unknown>)
    : {};
}

function readSettle(body: unknown): SettleEntryRequest | undefined {
  const { status, actual } = asRecord(body);

  if (typeof status !== 'string' || !SETTLE_STATUSES.has(status)) {
    return undefined;
  }
  if (actual !== undefined && typeof actual !== 'number') {
    return undefined;
  }
  return {
    status: status as SettleEntryRequest['status'],
    ...(typeof actual === 'number' ? { actual } : {}),
  };
}

function readAdd(body: unknown): AddEntryRequest | undefined {
  const record = asRecord(body);
  const { description, kind, dueDate, amount } = record;
  const isEstimate = record['isEstimate'];

  if (
    typeof description !== 'string' ||
    typeof kind !== 'string' ||
    !KINDS.has(kind) ||
    typeof dueDate !== 'string' ||
    typeof amount !== 'number'
  ) {
    return undefined;
  }
  return {
    description,
    kind: kind as AddEntryRequest['kind'],
    dueDate,
    amount,
    ...(typeof isEstimate === 'boolean' ? { isEstimate } : {}),
  };
}

/** UC-3.4, UC-3.5, UC-3.7, UC-3.8, UC-3.9 — everything that writes a ledger. */
export function registerLedgerRoutes(
  app: FastifyInstance,
  { ledgerActions, closeCycle }: Dependencies,
): void {
  app.post<{ Params: { month: string } }>(
    '/cycles/:month/entries',
    async (request, reply) => {
      const input = readAdd(request.body);
      if (input === undefined) {
        return badRequest(
          reply,
          'description, kind, dueDate and amount are required.',
        );
      }

      try {
        const id = await ledgerActions.addEntry({
          month: request.params.month,
          description: input.description,
          kind: input.kind,
          dueDate: input.dueDate,
          amountCents: input.amount,
          ...(input.isEstimate === undefined
            ? {}
            : { isEstimate: input.isEstimate }),
        });
        return await reply.status(201).send({ id });
      } catch (error) {
        return handle(error, reply);
      }
    },
  );

  app.post<{ Params: { month: string; entryId: string } }>(
    '/cycles/:month/entries/:entryId/settle',
    async (request, reply) => {
      const input = readSettle(request.body);
      if (input === undefined) {
        return badRequest(
          reply,
          'status tem de ser PAID, RECEIVED ou SKIPPED.',
        );
      }

      try {
        if (input.status === 'SKIPPED') {
          await ledgerActions.skip(
            request.params.month,
            request.params.entryId,
          );
        } else {
          await ledgerActions.settle({
            month: request.params.month,
            entryId: request.params.entryId,
            status: input.status,
            ...(input.actual === undefined
              ? {}
              : { actualCents: input.actual }),
          });
        }
        return await reply.status(204).send();
      } catch (error) {
        return handle(error, reply);
      }
    },
  );

  app.put<{ Params: { month: string; entryId: string } }>(
    '/cycles/:month/entries/:entryId/override',
    async (request, reply) => {
      const { amount } = asRecord(request.body);
      if (typeof amount !== 'number') {
        return badRequest(reply, 'amount é obrigatório.');
      }

      try {
        await ledgerActions.override(
          request.params.month,
          request.params.entryId,
          amount,
        );
        return await reply.status(204).send();
      } catch (error) {
        return handle(error, reply);
      }
    },
  );

  app.delete<{ Params: { month: string; entryId: string } }>(
    '/cycles/:month/entries/:entryId/override',
    async (request, reply) => {
      try {
        await ledgerActions.revertOverride(
          request.params.month,
          request.params.entryId,
        );
        return await reply.status(204).send();
      } catch (error) {
        return handle(error, reply);
      }
    },
  );

  app.delete<{ Params: { month: string; entryId: string } }>(
    '/cycles/:month/entries/:entryId',
    async (request, reply) => {
      try {
        await ledgerActions.removeEntry(
          request.params.month,
          request.params.entryId,
        );
        return await reply.status(204).send();
      } catch (error) {
        return handle(error, reply);
      }
    },
  );

  app.post<{ Params: { month: string } }>(
    '/cycles/:month/close',
    async (request, reply) => {
      try {
        await closeCycle.close(request.params.month);
        return await reply.status(204).send();
      } catch (error) {
        return handle(error, reply);
      }
    },
  );

  app.get<{ Params: { month: string } }>(
    '/cycles/:month/reopen-preview',
    async (request, reply) => {
      try {
        return toPreview(await closeCycle.previewReopen(request.params.month));
      } catch (error) {
        return handle(error, reply);
      }
    },
  );

  app.post<{ Params: { month: string } }>(
    '/cycles/:month/reopen',
    async (request, reply) => {
      try {
        return toPreview(await closeCycle.reopen(request.params.month));
      } catch (error) {
        return handle(error, reply);
      }
    },
  );
}

function toPreview(preview: {
  month: string;
  shifts: readonly {
    month: string;
    currentOpeningCents: number;
    recomputedOpeningCents: number;
  }[];
}): ReopenPreviewResponse {
  return {
    month: preview.month,
    shifts: preview.shifts.map((shift) => ({
      month: shift.month,
      currentOpening: shift.currentOpeningCents,
      recomputedOpening: shift.recomputedOpeningCents,
    })),
  };
}

function badRequest(reply: FastifyReply, message: string) {
  return reply.status(400).send({ error: message });
}

/**
 * A closed cycle, an unsettled one and a cycle still running are all conflicts
 * rather than bad input: the request is well formed, the state just does not
 * allow it.
 */
function handle(error: unknown, reply: FastifyReply) {
  if (error instanceof CycleNotFound || error instanceof EntryNotFound) {
    return reply.status(404).send({ error: error.message });
  }
  if (
    error instanceof CycleClosed ||
    error instanceof CycleNotSettled ||
    error instanceof CycleNotOverYet ||
    error instanceof InvalidSettlement
  ) {
    return reply.status(409).send({ error: error.message });
  }
  if (
    error instanceof EntryNotInCycle ||
    error instanceof InvalidEntry ||
    error instanceof InvalidAmount ||
    error instanceof InvalidDate ||
    error instanceof InvalidAnchor
  ) {
    return badRequest(reply, error.message);
  }
  throw error;
}
