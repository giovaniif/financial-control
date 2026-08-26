import type {
  AllocationPreviewResponse,
  AllocationRuleRequest,
  BucketResponse,
} from '@fin/contracts';
import type { FastifyInstance, FastifyReply } from 'fastify';

import type {
  AllocationPreview,
  BucketView,
  ManageBuckets,
} from '../../../application/goals/uc-6-manage-buckets.js';
import { BucketNotFound } from '../../../application/goals/uc-6-manage-buckets.js';
import { CycleClosed } from '../../../domain/budgeting/cycle.js';
import { InvalidBucketEvent } from '../../../domain/goals/bucket-event.js';
import {
  InvalidBucket,
  WithdrawalTooLarge,
} from '../../../domain/goals/bucket.js';
import { InvalidDate } from '../../../domain/shared/local-date.js';
import { InvalidAmount } from '../../../domain/shared/money.js';
import { InvalidPercentage } from '../../../domain/shared/percentage.js';

interface Dependencies {
  manageBuckets: ManageBuckets;
}

type DomainRule =
  { kind: 'PERCENT'; percent: number } | { kind: 'FIXED'; amountCents: number };

function asRecord(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null
    ? (body as Record<string, unknown>)
    : {};
}

function readRule(value: unknown): DomainRule | undefined {
  const { kind, percent, amount } = asRecord(value);

  if (kind === 'PERCENT' && typeof percent === 'number') {
    return { kind: 'PERCENT', percent };
  }
  if (kind === 'FIXED' && typeof amount === 'number') {
    return { kind: 'FIXED', amountCents: amount };
  }
  return undefined;
}

export function toResponse(view: BucketView): BucketResponse {
  return {
    id: view.id,
    name: view.name,
    purpose: view.purpose,
    mode: view.mode,
    status: view.status,
    priority: view.priority,
    balance: view.balanceCents,
    contributed: view.contributedCents,
    yielded: view.yieldedCents,
    target: view.targetCents ?? null,
    targetDate: view.targetDate ?? null,
    percentComplete: view.percentComplete ?? null,
    rule:
      view.rule.kind === 'PERCENT'
        ? { kind: 'PERCENT', percent: view.rule.percent }
        : { kind: 'FIXED', amount: view.rule.amountCents },
    expectedYieldPercent: view.expectedYieldPercent ?? null,
    events: view.events.map((event) => ({
      id: event.id,
      kind: event.kind as BucketResponse['events'][number]['kind'],
      when: event.when,
      amount: event.amountCents,
      reason: event.reason ?? null,
      ruleWouldHaveBeen: event.ruleWouldHaveBeenCents ?? null,
    })),
  };
}

function toPreview(preview: AllocationPreview): AllocationPreviewResponse {
  return {
    month: preview.month,
    expectedSurplus: preview.expectedSurplusCents,
    fundings: preview.fundings.map((funding) => ({
      bucketId: funding.bucketId,
      name: funding.name,
      requested: funding.requestedCents,
      funded: funding.fundedCents,
      isFullyFunded: funding.isFullyFunded,
    })),
    shortfall: preview.shortfallCents,
    isOvercommitted: preview.isOvercommitted,
  };
}

/** UC-6 — buckets, their rules, and the money they take from each cycle. */
export function registerBucketRoutes(
  app: FastifyInstance,
  { manageBuckets }: Dependencies,
): void {
  app.get('/buckets', async (): Promise<BucketResponse[]> => {
    const buckets = await manageBuckets.list();
    return buckets.map(toResponse);
  });

  app.post('/buckets', async (request, reply) => {
    const record = asRecord(request.body);
    const { name, mode, priority } = record;
    const rule = readRule(record['rule']);
    const purpose = record['purpose'];

    if (
      typeof name !== 'string' ||
      typeof priority !== 'number' ||
      rule === undefined
    ) {
      return badRequest(reply, 'name, rule e priority são obrigatórios.');
    }

    try {
      if (mode === 'ONGOING') {
        const bucket = await manageBuckets.createOngoing({
          name,
          rule,
          priority,
          ...(typeof purpose === 'string' ? { purpose } : {}),
        });
        return await reply.status(201).send(toResponse(bucket));
      }

      const target = record['target'];
      const targetDate = record['targetDate'];
      if (typeof target !== 'number' || typeof targetDate !== 'string') {
        return await badRequest(
          reply,
          'A goal needs a target and a targetDate.',
        );
      }

      const bucket = await manageBuckets.createGoal({
        name,
        targetCents: target,
        targetDate,
        rule,
        priority,
        ...(typeof purpose === 'string' ? { purpose } : {}),
      });
      return await reply.status(201).send(toResponse(bucket));
    } catch (error) {
      return handle(error, reply);
    }
  });

  app.patch<{ Params: { id: string } }>(
    '/buckets/:id',
    async (request, reply) => {
      const record = asRecord(request.body);
      const rule = readRule(record['rule']);
      const priority = record['priority'];
      const expectedYieldPercent = record['expectedYieldPercent'];
      const status = record['status'];
      // `null` is the instruction to stop aiming, so its presence is what
      // matters — an absent key means the caller said nothing about it.
      const hasTarget = 'target' in record;
      const target = readTarget(record['target']);

      try {
        let view: BucketView | undefined;
        if (rule !== undefined) {
          view = await manageBuckets.changeRule(request.params.id, rule);
        }
        if (typeof priority === 'number') {
          view = await manageBuckets.changePriority(
            request.params.id,
            priority,
          );
        }
        if (typeof expectedYieldPercent === 'number') {
          view = await manageBuckets.setExpectedYield(
            request.params.id,
            expectedYieldPercent,
          );
        }
        if (status === 'ARCHIVED') {
          view = await manageBuckets.archive(request.params.id);
        }
        if (hasTarget) {
          if (record['target'] !== null && target === undefined) {
            return await badRequest(
              reply,
              'target precisa de amount em centavos e date como YYYY-MM-DD.',
            );
          }
          view = await manageBuckets.setTarget(request.params.id, target);
        }

        if (view === undefined) {
          return await badRequest(
            reply,
            'É preciso informar rule, priority, expectedYieldPercent, status ou target.',
          );
        }
        return toResponse(view);
      } catch (error) {
        return handle(error, reply);
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    '/buckets/:id/events',
    async (request, reply) => {
      const record = asRecord(request.body);
      const { kind, amount, date, reason, month } = record;

      if (typeof kind !== 'string') {
        return badRequest(reply, 'kind é obrigatório.');
      }

      try {
        switch (kind) {
          case 'YIELD':
            if (typeof amount !== 'number' || typeof date !== 'string') {
              return await badRequest(reply, 'amount e date são obrigatórios.');
            }
            return toResponse(
              await manageBuckets.recordYield(request.params.id, date, amount),
            );
          case 'CORRECTION':
            if (
              typeof amount !== 'number' ||
              typeof date !== 'string' ||
              typeof reason !== 'string'
            ) {
              return await badRequest(
                reply,
                'amount, date and reason are required.',
              );
            }
            return toResponse(
              await manageBuckets.correctBalance(
                request.params.id,
                date,
                amount,
                reason,
              ),
            );
          case 'WITHDRAWAL':
            if (
              typeof amount !== 'number' ||
              typeof date !== 'string' ||
              typeof reason !== 'string'
            ) {
              return await badRequest(
                reply,
                'amount, date and reason are required.',
              );
            }
            return toResponse(
              await manageBuckets.withdraw(
                request.params.id,
                date,
                amount,
                reason,
              ),
            );
          case 'OVERRIDE':
            if (typeof amount !== 'number' || typeof month !== 'string') {
              return await badRequest(
                reply,
                'amount e month são obrigatórios.',
              );
            }
            return toResponse(
              await manageBuckets.overrideContribution(
                request.params.id,
                month,
                amount,
              ),
            );
          default:
            return await badRequest(reply, `Unknown event kind ${kind}.`);
        }
      } catch (error) {
        return handle(error, reply);
      }
    },
  );

  app.get<{ Params: { month: string } }>(
    '/cycles/:month/allocation-preview',
    async (request, reply) => {
      try {
        return toPreview(
          await manageBuckets.previewAllocation(request.params.month),
        );
      } catch (error) {
        return handle(error, reply);
      }
    },
  );

  app.post<{ Params: { month: string } }>(
    '/cycles/:month/allocate',
    async (request, reply) => {
      try {
        return toPreview(await manageBuckets.allocate(request.params.month));
      } catch (error) {
        return handle(error, reply);
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/buckets/:id',
    async (request, reply) => {
      try {
        await manageBuckets.delete(request.params.id);
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
  if (error instanceof BucketNotFound) {
    return reply.status(404).send({ error: error.message });
  }
  if (error instanceof WithdrawalTooLarge || error instanceof CycleClosed) {
    return reply.status(409).send({ error: error.message });
  }
  if (
    error instanceof InvalidBucket ||
    error instanceof InvalidBucketEvent ||
    error instanceof InvalidAmount ||
    error instanceof InvalidDate ||
    error instanceof InvalidPercentage
  ) {
    return badRequest(reply, error.message);
  }
  throw error;
}

export type { AllocationRuleRequest };

/** A target, or nothing when the caller sent `null` or something unreadable. */
function readTarget(
  value: unknown,
): { targetCents: number; targetDate: string } | undefined {
  const record =
    typeof value === 'object' && value !== null ? asRecord(value) : {};
  const amount = record['amount'];
  const date = record['date'];

  return typeof amount === 'number' && typeof date === 'string'
    ? { targetCents: amount, targetDate: date }
    : undefined;
}
