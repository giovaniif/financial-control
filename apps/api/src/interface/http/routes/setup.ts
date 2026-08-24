import type {
  AccountType,
  AllocationRuleRequest,
  EstablishedBucketFields,
  EstablishedRecordResponse,
  SetupAppliedResponse,
  SetupDueDayRefusalResponse,
  SetupRecordCorrectionRequest,
  SetupStateResponse,
  SetupTurnRequest,
  SetupTurnResponse,
} from '@fin/contracts';
import type { SetupDocument } from '../../../application/setup/setup-document.js';
import type { FastifyInstance, FastifyReply } from 'fastify';

import type { ReadSetupState } from '../../../application/projection/uc-1-5-read-setup-state.js';
import type { CompleteSetup } from '../../../application/setup/compose-setup.js';
import { SetupNotComplete } from '../../../application/setup/compose-setup.js';
import type { EstablishedRecord } from '../../../application/setup/established-record.js';
import type { RecordCorrection } from '../../../application/setup/record-correction.js';
import type { DraftBucket } from '../../../application/setup/setup-draft.js';
import {
  AnchorNotChosen,
  DueDayOutsideCycle,
  InvalidSetupRecord,
  SetupRecordNotFound,
} from '../../../application/setup/setup-draft.js';
import { SpendCeilingReached } from '../../../application/spend/spend-ceiling.js';
import type { CorrectSetupRecord } from '../../../application/setup/uc-1-5-correct-record.js';
import { NothingToCorrect } from '../../../application/setup/uc-1-5-correct-record.js';
import type {
  ConverseSetup,
  SetupTurn,
} from '../../../application/setup/uc-1-5-converse-setup.js';
import {
  SetupConversationNotFound,
  SetupConversationTooLong,
  SetupMessageTooLong,
} from '../../../application/setup/uc-1-5-converse-setup.js';
import { Allocation } from '../../../domain/goals/bucket.js';
import type { AllocationRule } from '../../../domain/goals/bucket.js';
import {
  LanguageModelFailed,
  LanguageModelUnavailable,
} from '../../../domain/ports/language-model.js';
import { LocalDate } from '../../../domain/shared/local-date.js';
import { Money } from '../../../domain/shared/money.js';
import { Percentage } from '../../../domain/shared/percentage.js';
import { principalOf } from '../principal.js';
import type { SpendGuard } from '../rate-limit.js';

interface Dependencies {
  readSetupState: ReadSetupState;
  converseSetup: ConverseSetup;
  correctSetupRecord: CorrectSetupRecord;
  completeSetup: CompleteSetup;
  /** Only the conversational turn reaches a model — FIN-114. */
  spendGuard: SpendGuard;
}

/** UC-1.5 — the first run: what is still missing, and the conversation. */
export function registerSetupRoutes(
  app: FastifyInstance,
  {
    readSetupState,
    converseSetup,
    correctSetupRecord,
    completeSetup,
    spendGuard,
  }: Dependencies,
): void {
  app.get('/setup', async (): Promise<SetupStateResponse> => {
    const state = await readSetupState.execute();

    return { ...state, assistantAvailable: converseSetup.isAvailable };
  });

  app.post(
    '/setup/conversation',
    { onRequest: spendGuard },
    async (request, reply) => {
      const input = readTurnRequest(request.body);
      if (input === undefined) {
        return badRequest(
          reply,
          'message é obrigatório, e conversationId tem de ser uma string quando vier.',
        );
      }

      try {
        return toTurn(await converseSetup.execute(principalOf(), input));
      } catch (error) {
        return handle(error, reply);
      }
    },
  );

  /**
   * The inline edit — FIN-122. No model is reached from here: the fields are
   * already named, so there is nothing for one to interpret and no reason to
   * pay for the latency. Prose corrections stay on the conversation route.
   */
  app.patch<{ Params: { id: string; recordId: string } }>(
    '/setup/conversation/:id/records/:recordId',
    async (request, reply) => {
      const correction = readCorrection(request.body);
      if (correction === undefined) {
        return badRequest(
          reply,
          'A correction states the fields that change, each in its own type.',
        );
      }

      try {
        return toTurn(
          await correctSetupRecord.correct({
            conversationId: request.params.id,
            recordId: request.params.recordId,
            correction,
          }),
        );
      } catch (error) {
        return handle(error, reply);
      }
    },
  );

  app.delete<{ Params: { id: string; recordId: string } }>(
    '/setup/conversation/:id/records/:recordId',
    async (request, reply) => {
      try {
        return toTurn(
          await correctSetupRecord.remove({
            conversationId: request.params.id,
            recordId: request.params.recordId,
          }),
        );
      } catch (error) {
        return handle(error, reply);
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    '/setup/conversation/:id/apply',
    async (request, reply) => {
      try {
        return toApplied(await completeSetup.execute(request.params.id));
      } catch (error) {
        return handle(error, reply);
      }
    },
  );
}

function readTurnRequest(body: unknown): SetupTurnRequest | undefined {
  const record =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : undefined;

  const message = record?.['message'];
  if (typeof message !== 'string' || message.trim() === '') return undefined;

  // A client that sends `null` for the first turn means the same as one that
  // leaves the key out, and reading the two differently would open a
  // conversation the caller thought it was continuing.
  const conversationId = record?.['conversationId'] ?? undefined;
  if (conversationId !== undefined && typeof conversationId !== 'string') {
    return undefined;
  }

  return conversationId === undefined
    ? { message }
    : { message, conversationId };
}

/**
 * The correction as the domain holds it, or `undefined` when the body is not
 * one. Every field is read on its own: a field of the wrong type is refused
 * rather than skipped, because a silently ignored amount is an edit the user
 * believes they made.
 */
function readCorrection(body: unknown): RecordCorrection | undefined {
  const record =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : undefined;
  if (record === undefined) return undefined;

  const correction: RecordCorrection = {
    name: readText(record, 'name'),
    type: readAccountType(record),
    balance: readCents(record, 'balance'),
    amount: readCents(record, 'amount'),
    dueDayOfMonth: readInteger(record, 'dueDayOfMonth'),
    isEstimate: readFlag(record, 'isEstimate'),
    acceptCycleFallback: readFlag(record, 'acceptCycleFallback'),
    limit: readCents(record, 'limit'),
    closingDay: readInteger(record, 'closingDay'),
    dueDay: readInteger(record, 'dueDay'),
    paymentAccountName: readText(record, 'paymentAccountName'),
    rule: readRule(record),
    targetAmount: readCents(record, 'target'),
    targetDate: readDate(record, 'targetDate'),
  };

  return Object.keys(record).every((field) => STATED.has(field)) &&
    stated(record).every((field) => correction[field] !== undefined)
    ? correction
    : undefined;
}

/** Which field of the correction each key of the request body fills. */
const FIELDS = {
  name: 'name',
  type: 'type',
  balance: 'balance',
  amount: 'amount',
  dueDayOfMonth: 'dueDayOfMonth',
  isEstimate: 'isEstimate',
  acceptCycleFallback: 'acceptCycleFallback',
  rule: 'rule',
  target: 'targetAmount',
  targetDate: 'targetDate',
} as const satisfies Record<
  keyof SetupRecordCorrectionRequest,
  keyof RecordCorrection
>;

const STATED = new Set(Object.keys(FIELDS));

/** The fields the body actually carries, as the correction names them. */
function stated(record: Record<string, unknown>): (keyof RecordCorrection)[] {
  return Object.entries(FIELDS)
    .filter(([field]) => record[field] !== undefined)
    .map(([, name]) => name);
}

function readText(
  record: Record<string, unknown>,
  field: string,
): string | undefined {
  const value = record[field];
  return typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : undefined;
}

function readInteger(
  record: Record<string, unknown>,
  field: string,
): number | undefined {
  const value = record[field];
  return typeof value === 'number' && Number.isSafeInteger(value)
    ? value
    : undefined;
}

function readCents(
  record: Record<string, unknown>,
  field: string,
): Money | undefined {
  const cents = readInteger(record, field);
  return cents === undefined ? undefined : Money.fromCents(cents);
}

function readFlag(
  record: Record<string, unknown>,
  field: string,
): boolean | undefined {
  const value = record[field];
  return typeof value === 'boolean' ? value : undefined;
}

const ACCOUNT_TYPES: readonly AccountType[] = ['CHECKING', 'SAVINGS', 'CASH'];

function readAccountType(
  record: Record<string, unknown>,
): AccountType | undefined {
  const value = record['type'];
  return ACCOUNT_TYPES.find((type) => type === value);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function readDate(
  record: Record<string, unknown>,
  field: string,
): LocalDate | undefined {
  const value = readText(record, field);
  return value !== undefined && ISO_DATE.test(value)
    ? LocalDate.parse(value)
    : undefined;
}

function readRule(record: Record<string, unknown>): AllocationRule | undefined {
  const rule = record['rule'];
  if (typeof rule !== 'object' || rule === null) return undefined;

  const stated = rule as Record<string, unknown>;
  const percent = stated['percent'];
  if (
    stated['kind'] === 'PERCENT' &&
    typeof percent === 'number' &&
    Number.isFinite(percent) &&
    percent >= 0
  ) {
    // Basis points are the finest a percentage is held in, so a figure with
    // more decimals than that is rounded rather than refused.
    return Allocation.percentOfExpectedSurplus(
      Percentage.ofBasisPoints(Math.round(percent * 100)),
    );
  }

  const amount = readInteger(stated, 'amount');
  return stated['kind'] === 'FIXED' && amount !== undefined
    ? Allocation.fixed(Money.fromCents(amount))
    : undefined;
}

/**
 * The record as data beside the sentence it is shown as — FIN-124. Both come
 * off the same draft record, so a client never has to read one out of the
 * other.
 */
function toEstablished(record: EstablishedRecord): EstablishedRecordResponse {
  const shown = { id: record.id ?? null, summary: record.summary };

  switch (record.section) {
    case 'ANCHOR':
    case 'SALARY':
      return { ...shown, section: record.section, fields: null };
    case 'ACCOUNTS':
      return {
        ...shown,
        section: record.section,
        fields: {
          name: record.record.name,
          type: record.record.type,
          balance: record.record.balance.cents,
        },
      };
    case 'FIXED_BILLS':
    case 'VARIABLE_BILLS':
      return {
        ...shown,
        section: record.section,
        fields: {
          name: record.record.name,
          amount: record.record.amount.cents,
          dueDayOfMonth: record.record.dueDayOfMonth,
          isEstimate: record.record.isEstimate,
        },
      };
    case 'BUCKETS':
      return {
        ...shown,
        section: record.section,
        fields: toBucket(record.record),
      };
    default: {
      const unreachable: never = record;
      return unreachable;
    }
  }
}

function toBucket(bucket: DraftBucket): EstablishedBucketFields {
  const common = {
    name: bucket.name,
    rule: toRule(bucket.rule),
    priority: bucket.priority,
  };

  return bucket.mode === 'GOAL'
    ? {
        mode: 'GOAL',
        ...common,
        target: bucket.target.amount.cents,
        targetDate: bucket.target.date.toISO(),
      }
    : { mode: 'ONGOING', ...common };
}

function toRule(rule: AllocationRule): AllocationRuleRequest {
  return rule.kind === 'PERCENT'
    ? { kind: 'PERCENT', percent: rule.percentage.percent }
    : { kind: 'FIXED', amount: rule.amount.cents };
}

function toTurn(turn: SetupTurn): SetupTurnResponse {
  return {
    conversationId: turn.conversationId,
    message: turn.message,
    established: turn.established.map(toEstablished),
    removed: [...turn.removed],
    corrections: [...turn.corrections],
    nextSection: turn.nextSection ?? null,
    isComplete: turn.isComplete,
    wasRefused: turn.wasRefused,
  };
}

/**
 * Counts rather than the whole document: what the user wants confirmed is that
 * the conversation became real data, and every one of these has a screen of
 * its own to read it back from.
 */
function toApplied(document: SetupDocument): SetupAppliedResponse {
  return {
    anchorDay: document.anchor.anchorDay,
    shiftPolicy: document.anchor.shiftPolicy,
    accounts: document.accounts.length,
    templates: document.templates.length,
    buckets: document.buckets.length,
  };
}

function badRequest(reply: FastifyReply, message: string) {
  return reply.status(400).send({ error: message });
}

function handle(error: unknown, reply: FastifyReply) {
  if (
    error instanceof SetupConversationNotFound ||
    error instanceof SetupRecordNotFound
  ) {
    return reply.status(404).send({ error: error.message });
  }
  // What the draft refuses is a rule the caller broke, named in full: the
  // structured path and the conversational one turn down the same records,
  // and only the way they say so differs.
  // The refusal travels whole: which cycles could not place the day, and the
  // day each offers instead, so the client can put the offer rather than a
  // dead end — FIN-117.
  if (error instanceof DueDayOutsideCycle) {
    return reply.status(400).send({
      error: error.message,
      dueDayOfMonth: error.dueDayOfMonth,
      cycles: error.cycles.map((cycle) => ({
        month: cycle.month,
        label: cycle.label,
        range: cycle.range,
        fallbackDate: cycle.fallbackDate.toISO(),
        fallbackDayOfMonth: cycle.fallbackDayOfMonth,
      })),
    } satisfies SetupDueDayRefusalResponse);
  }
  // The two caps answer with the codes the assistant's already do — FIN-113.
  // An over-long message is a request that was never acceptable; a
  // conversation past its turns is a state the next request conflicts with.
  if (
    error instanceof NothingToCorrect ||
    error instanceof InvalidSetupRecord ||
    error instanceof AnchorNotChosen ||
    error instanceof SetupMessageTooLong
  ) {
    return badRequest(reply, error.message);
  }
  if (
    error instanceof SetupNotComplete ||
    error instanceof SetupConversationTooLong
  ) {
    return reply.status(409).send({ error: error.message });
  }
  // 503 is the same fact `GET /setup` reports as `assistantAvailable: false`:
  // nothing is wrong, there is simply no model configured, and the client
  // falls back to the plain form. A model that was reached and failed is a
  // different situation and must not collapse into the same code.
  // The day's ceiling reads exactly as the missing key does: nothing is
  // wrong, the assistant is switched off, and the client falls back to the
  // plain form. Both are a state the app is expected to be in.
  if (
    error instanceof LanguageModelUnavailable ||
    error instanceof SpendCeilingReached
  ) {
    return reply.status(503).send({ error: error.message });
  }
  if (error instanceof LanguageModelFailed) {
    return reply.status(502).send({ error: error.message });
  }
  throw error;
}
