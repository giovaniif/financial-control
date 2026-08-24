import { ShiftPolicy } from '../../domain/budgeting/cycle-ref.js';
import { EntryKind } from '../../domain/budgeting/ledger-entry.js';
import { Direction } from '../../domain/budgeting/recurring-template.js';
import type { AllocationRule } from '../../domain/goals/bucket.js';
import { Allocation } from '../../domain/goals/bucket.js';
import type {
  JsonObject,
  JsonValue,
  ToolDeclaration,
} from '../../domain/ports/language-model.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import { LocalDate } from '../../domain/shared/local-date.js';
import { Money } from '../../domain/shared/money.js';
import { Percentage } from '../../domain/shared/percentage.js';
import { SettlementStatus } from '../../domain/shared/planned-actual.js';
import { EditScope } from '../budgeting/uc-2-manage-templates.js';

import type { ProposedChange } from './proposed-change.js';

/**
 * The model's arguments do not describe a change. Handed back to it as a tool
 * error, so it can ask the user for what is missing and try again — never a
 * proposal with a field guessed at.
 */
export class UnreadableProposal extends DomainError {}

/**
 * How the assistant asks for a change.
 *
 * `compose` reads arguments into a {@link ProposedChange} and does nothing
 * else: it consults no repository and checks no rule. A proposal built
 * against the figures of this moment may be confirmed an hour later, so
 * anything checked here would prove nothing about the state it lands in —
 * `ApplyProposal` hands it to the interactor that owns the rule instead.
 *
 * No tool takes an identity. A tool that cannot express "somebody else's
 * data" cannot be talked into touching it, and a bill description is
 * user-entered text that reaches the model through tool results.
 */
export interface ProposalToolSpec {
  readonly tool: ToolDeclaration;
  readonly compose: (args: JsonObject) => ProposedChange;
}

const MONTH_FIELD = {
  type: 'string',
  description: 'the cycle, as YYYY-MM — the month the money is spent in',
};

const DATE_FIELD = (description: string): JsonObject => ({
  type: 'string',
  description: `${description}, as YYYY-MM-DD`,
});

const CENTS_FIELD = (description: string): JsonObject => ({
  type: 'integer',
  description: `${description}, in whole cents — R$ 1.234,56 is 123456, and money going out is negative`,
});

const ESTIMATE_FIELD = {
  type: 'boolean',
  description:
    'whether this is an unconfirmed estimate rather than a known figure. Defaults to false',
};

const PRIORITY_FIELD = {
  type: 'integer',
  minimum: 1,
  description:
    'the funding order, lowest first, when Expected Surplus cannot cover every rule',
};

const RULE_FIELDS: JsonObject = {
  percentOfExpectedSurplus: {
    type: 'number',
    description:
      "the share of each cycle's Expected Surplus that goes in, as a percentage",
  },
  fixedAmountInCents: {
    type: 'integer',
    description: 'a fixed amount per cycle instead of a percentage, in cents',
  },
};

export const PROPOSAL_TOOLS: readonly ProposalToolSpec[] = [
  {
    tool: {
      name: 'propose_settle_entry',
      description:
        'Propose turning a planned entry into a fact: paid, received, or skipped when it never happened. Read the cycle first — the entry id comes from there, never from memory.',
      inputSchema: schema(
        {
          month: MONTH_FIELD,
          entryId: { type: 'string', description: "the entry's id" },
          status: {
            type: 'string',
            enum: [
              SettlementStatus.Paid,
              SettlementStatus.Received,
              SettlementStatus.Skipped,
            ],
            description:
              'PAID or RECEIVED when money moved, SKIPPED when it did not',
          },
          actualAmountInCents: CENTS_FIELD(
            'what actually moved, when it differs from the planned amount',
          ),
        },
        ['month', 'entryId', 'status'],
      ),
    },
    compose: (args) => ({
      kind: 'SETTLE_ENTRY',
      month: requireMonth(args, 'month'),
      entryId: requireText(args, 'entryId'),
      status: requireChoice(args, 'status', [
        SettlementStatus.Paid,
        SettlementStatus.Received,
        SettlementStatus.Skipped,
      ]),
      actual: readCents(args, 'actualAmountInCents'),
    }),
  },
  {
    tool: {
      name: 'propose_add_entry',
      description:
        'Propose a one-off entry in a cycle that no recurring template covers — an unusual bill, a reimbursement, a side payment.',
      inputSchema: schema(
        {
          month: MONTH_FIELD,
          description: {
            type: 'string',
            description: 'what it is, in the user’s own words',
          },
          // Invoices and allocations are generated from a card and from a
          // bucket rule; entering one by hand would leave a line with nothing
          // behind it.
          entryKind: {
            type: 'string',
            enum: [EntryKind.Income, EntryKind.Fixed, EntryKind.Variable],
            description:
              'INCOME for money in, FIXED for a recurring-sized bill, VARIABLE for a one-off',
          },
          dueDate: DATE_FIELD('the day the money moves'),
          amountInCents: CENTS_FIELD('the amount'),
          isEstimate: ESTIMATE_FIELD,
        },
        ['month', 'description', 'entryKind', 'dueDate', 'amountInCents'],
      ),
    },
    compose: (args) => ({
      kind: 'ADD_ENTRY',
      month: requireMonth(args, 'month'),
      description: requireText(args, 'description'),
      entryKind: requireChoice(args, 'entryKind', [
        EntryKind.Income,
        EntryKind.Fixed,
        EntryKind.Variable,
      ]),
      dueDate: requireDate(args, 'dueDate'),
      amount: requireCents(args, 'amountInCents'),
      isEstimate: readFlag(args, 'isEstimate') ?? false,
    }),
  },
  {
    tool: {
      name: 'propose_recurring_template',
      description:
        'Propose a recurring income or outcome, which generates one entry per cycle from its start onward.',
      inputSchema: schema(
        {
          name: { type: 'string', description: 'what it is called' },
          direction: {
            type: 'string',
            enum: [Direction.In, Direction.Out],
            description: 'IN for money arriving, OUT for money leaving',
          },
          dueDayOfMonth: {
            type: 'integer',
            minimum: 1,
            maximum: 31,
            description: 'the day of the month it falls due',
          },
          amountInCents: CENTS_FIELD('the amount each cycle'),
          startMonth: MONTH_FIELD,
          endMonth: {
            type: 'string',
            description: 'the last cycle it generates into, as YYYY-MM',
          },
          isEstimate: ESTIMATE_FIELD,
        },
        ['name', 'direction', 'dueDayOfMonth', 'amountInCents'],
      ),
    },
    compose: (args) => ({
      kind: 'CREATE_TEMPLATE',
      name: requireText(args, 'name'),
      direction: requireChoice(args, 'direction', [
        Direction.In,
        Direction.Out,
      ]),
      dueDayOfMonth: requireInteger(args, 'dueDayOfMonth'),
      amount: requireCents(args, 'amountInCents'),
      startMonth: readMonth(args, 'startMonth'),
      endMonth: readMonth(args, 'endMonth'),
      isEstimate: readFlag(args, 'isEstimate') ?? false,
    }),
  },
  {
    tool: {
      name: 'propose_template_amount_change',
      description:
        'Propose changing what a recurring template is worth, from one cycle onward or for that cycle alone. Past cycles are never touched either way.',
      inputSchema: schema(
        {
          templateId: { type: 'string', description: "the template's id" },
          fromMonth: MONTH_FIELD,
          amountInCents: CENTS_FIELD('what it becomes'),
          scope: {
            type: 'string',
            enum: [EditScope.ThisCycleOnly, EditScope.ThisAndFuture],
            description:
              'THIS_AND_FUTURE for a lasting change, THIS_CYCLE_ONLY for one cycle',
          },
        },
        ['templateId', 'fromMonth', 'amountInCents', 'scope'],
      ),
    },
    compose: (args) => ({
      kind: 'CHANGE_TEMPLATE_AMOUNT',
      templateId: requireText(args, 'templateId'),
      fromMonth: requireMonth(args, 'fromMonth'),
      amount: requireCents(args, 'amountInCents'),
      scope: requireChoice(args, 'scope', [
        EditScope.ThisCycleOnly,
        EditScope.ThisAndFuture,
      ]),
    }),
  },
  {
    tool: {
      name: 'propose_payday_anchor_change',
      description:
        'Propose moving the day the salary lands. It re-slices every open cycle, so say what that means before proposing it.',
      inputSchema: schema(
        {
          anchorDay: {
            type: 'integer',
            minimum: 1,
            maximum: 31,
            description: 'the day of the month the salary lands',
          },
          shiftPolicy: {
            type: 'string',
            enum: [ShiftPolicy.Preceding, ShiftPolicy.Following],
            description:
              'which business day pay moves to when that one is a weekend or holiday. Defaults to PRECEDING',
          },
        },
        ['anchorDay'],
      ),
    },
    compose: (args) => ({
      kind: 'CHANGE_PAYDAY_ANCHOR',
      anchorDay: requireInteger(args, 'anchorDay'),
      shiftPolicy:
        readChoice(args, 'shiftPolicy', [
          ShiftPolicy.Preceding,
          ShiftPolicy.Following,
        ]) ?? ShiftPolicy.Preceding,
    }),
  },
  {
    tool: {
      name: 'propose_goal_bucket',
      description:
        'Propose a savings bucket with a target amount and the date it is wanted by.',
      inputSchema: schema(
        {
          name: { type: 'string', description: 'what it is called' },
          targetInCents: CENTS_FIELD('the amount it is aiming at'),
          targetDate: DATE_FIELD('the day it is wanted by'),
          ...RULE_FIELDS,
          priority: PRIORITY_FIELD,
        },
        ['name', 'targetInCents', 'targetDate', 'priority'],
      ),
    },
    compose: (args) => ({
      kind: 'CREATE_GOAL_BUCKET',
      name: requireText(args, 'name'),
      target: requireCents(args, 'targetInCents'),
      targetDate: requireDate(args, 'targetDate'),
      rule: requireRule(args),
      priority: requireInteger(args, 'priority'),
    }),
  },
  {
    tool: {
      name: 'propose_ongoing_bucket',
      description:
        'Propose a savings bucket with no target and no finish line — a monthly commitment whose only question is whether the rate is right.',
      inputSchema: schema(
        {
          name: { type: 'string', description: 'what it is called' },
          ...RULE_FIELDS,
          priority: PRIORITY_FIELD,
        },
        ['name', 'priority'],
      ),
    },
    compose: (args) => ({
      kind: 'CREATE_ONGOING_BUCKET',
      name: requireText(args, 'name'),
      rule: requireRule(args),
      priority: requireInteger(args, 'priority'),
    }),
  },
  {
    tool: {
      name: 'propose_allocation_rule_change',
      description:
        'Propose changing how much a bucket takes from each cycle from now on. Past cycles keep whatever actually went in.',
      inputSchema: schema(
        {
          bucketId: { type: 'string', description: "the bucket's id" },
          ...RULE_FIELDS,
        },
        ['bucketId'],
      ),
    },
    compose: (args) => ({
      kind: 'CHANGE_ALLOCATION_RULE',
      bucketId: requireText(args, 'bucketId'),
      rule: requireRule(args),
    }),
  },
  {
    tool: {
      name: 'propose_contribution_override',
      description:
        'Propose putting a different amount into a bucket for one cycle only, leaving its rule alone.',
      inputSchema: schema(
        {
          bucketId: { type: 'string', description: "the bucket's id" },
          month: MONTH_FIELD,
          amountInCents: CENTS_FIELD('what goes in this once'),
        },
        ['bucketId', 'month', 'amountInCents'],
      ),
    },
    compose: (args) => ({
      kind: 'OVERRIDE_CONTRIBUTION',
      bucketId: requireText(args, 'bucketId'),
      month: requireMonth(args, 'month'),
      amount: requireCents(args, 'amountInCents'),
    }),
  },
];

const MONTH = /^\d{4}-\d{2}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `null` and an absent key both mean the model did not say. */
function stated(args: JsonObject, field: string): JsonValue | undefined {
  const value = args[field];
  return value === null ? undefined : value;
}

function missing(field: string, expectation: string): never {
  throw new UnreadableProposal(`${field} tem de ser ${expectation}.`);
}

function readText(args: JsonObject, field: string): string | undefined {
  const value = stated(args, field);
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return value.trim();
}

function requireText(args: JsonObject, field: string): string {
  return readText(args, field) ?? missing(field, 'um valor não vazio');
}

function readMonth(args: JsonObject, field: string): string | undefined {
  const value = readText(args, field);
  return value !== undefined && MONTH.test(value) ? value : undefined;
}

function requireMonth(args: JsonObject, field: string): string {
  return (
    readMonth(args, field) ?? missing(field, 'um ciclo no formato YYYY-MM')
  );
}

function requireDate(args: JsonObject, field: string): LocalDate {
  const value = readText(args, field);
  return value !== undefined && ISO_DATE.test(value)
    ? LocalDate.parse(value)
    : missing(field, 'uma data no formato YYYY-MM-DD');
}

function readInteger(args: JsonObject, field: string): number | undefined {
  const value = stated(args, field);
  return typeof value === 'number' && Number.isSafeInteger(value)
    ? value
    : undefined;
}

function requireInteger(args: JsonObject, field: string): number {
  return readInteger(args, field) ?? missing(field, 'um número inteiro');
}

function readCents(args: JsonObject, field: string): Money | undefined {
  const value = readInteger(args, field);
  return value === undefined ? undefined : Money.fromCents(value);
}

function requireCents(args: JsonObject, field: string): Money {
  return (
    readCents(args, field) ?? missing(field, 'um valor em centavos inteiros')
  );
}

function readFlag(args: JsonObject, field: string): boolean | undefined {
  const value = stated(args, field);
  return typeof value === 'boolean' ? value : undefined;
}

function readChoice<T extends string>(
  args: JsonObject,
  field: string,
  allowed: readonly T[],
): T | undefined {
  const value = readText(args, field);
  return allowed.find((option) => option === value);
}

function requireChoice<T extends string>(
  args: JsonObject,
  field: string,
  allowed: readonly T[],
): T {
  return (
    readChoice(args, field, allowed) ??
    missing(field, `um destes: ${allowed.join(', ')}`)
  );
}

/**
 * A bucket takes either a share of Expected Surplus or a fixed amount, and
 * saying both leaves the app to pick — which is exactly the guess a proposal
 * must never contain.
 */
function requireRule(args: JsonObject): AllocationRule {
  const percent = stated(args, 'percentOfExpectedSurplus');
  const amount = readCents(args, 'fixedAmountInCents');

  if (percent !== undefined && amount !== undefined) {
    throw new UnreadableProposal(
      'Uma caixinha recebe ou um percentual da Sobra Esperada ou um valor fixo, nunca os dois.',
    );
  }
  if (amount !== undefined) return Allocation.fixed(amount);
  if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0) {
    throw new UnreadableProposal(
      'Uma caixinha precisa de percentOfExpectedSurplus ou de fixedAmountInCents.',
    );
  }

  // Basis points are the finest a percentage is held in, so a figure with more
  // decimals than that is rounded rather than refused.
  return Allocation.percentOfExpectedSurplus(
    Percentage.ofBasisPoints(Math.round(percent * 100)),
  );
}

function schema(
  properties: JsonObject,
  required: readonly string[],
): JsonObject {
  return {
    type: 'object',
    properties,
    required: [...required],
    additionalProperties: false,
  };
}
