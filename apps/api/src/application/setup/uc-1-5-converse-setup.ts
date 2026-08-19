import { AccountType } from '../../domain/budgeting/account.js';
import { PaydayAnchor, ShiftPolicy } from '../../domain/budgeting/cycle-ref.js';
import type { AllocationRule } from '../../domain/goals/bucket.js';
import { Allocation } from '../../domain/goals/bucket.js';
import type { Clock } from '../../domain/ports/clock.js';
import type { HolidayCalendar } from '../../domain/ports/holiday-calendar.js';
import type { IdSource } from '../../domain/ports/id-source.js';
import type {
  JsonObject,
  JsonValue,
  LanguageModel,
  ModelMessage,
  ToolCall,
  ToolDeclaration,
  ToolResult,
} from '../../domain/ports/language-model.js';
import type {
  SetupConversationStore,
  StoredSetupConversation,
} from '../../domain/ports/setup-conversation-store.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import { LocalDate } from '../../domain/shared/local-date.js';
import { Money } from '../../domain/shared/money.js';
import { Percentage } from '../../domain/shared/percentage.js';
import { calendarMonthOf, monthOf } from '../budgeting/month.js';

import { SETUP_SECTIONS, SetupDraft, SetupSection } from './setup-draft.js';

export class SetupConversationNotFound extends DomainError {}

/** One thing the conversation established, in the user's own terms. */
export interface EstablishedRecord {
  readonly section: SetupSection;
  readonly summary: string;
}

/**
 * What the conversation has accumulated: the draft, and the section it is
 * asking about. The section is tracked separately because a draft counts a
 * section as answered the moment its first record lands, while the user is
 * usually still listing — three bills arrive across three turns.
 */
export interface SetupState {
  readonly draft: SetupDraft;
  readonly section: SetupSection | undefined;
}

export type SetupConversations = SetupConversationStore<
  SetupState,
  EstablishedRecord
>;

export interface SetupTurn {
  readonly conversationId: string;
  /** What to say next: the correction when there is one, else the model's. */
  readonly message: string;
  readonly established: readonly EstablishedRecord[];
  readonly corrections: readonly string[];
  readonly nextSection: SetupSection | undefined;
  readonly isComplete: boolean;
  readonly wasRefused: boolean;
}

/**
 * UC-1.5 — one turn of the setup conversation: what the user just said in,
 * the next thing to say and whatever it established out.
 *
 * **Extraction only ever happens through a tool schema.** Nothing is read out
 * of prose, and every record is offered to {@link SetupDraft}, which owns
 * every rule and is the only validator. So a transcript that reads like an
 * instruction is still only ever data: there is no path from what a user
 * typed to what this interactor does.
 *
 * The transcript is held here rather than round-tripped through the client —
 * see the store port for why.
 */
export class ConverseSetup {
  constructor(
    private readonly model: LanguageModel,
    private readonly conversations: SetupConversations,
    private readonly ids: IdSource,
    private readonly holidays: HolidayCalendar,
    private readonly clock: Clock,
  ) {}

  /**
   * Whether a conversation can be had at all. Read from the model itself so
   * that what the app reports up front and what a turn would fail with are the
   * same fact rather than two that can drift apart.
   */
  get isAvailable(): boolean {
    return this.model.isAvailable;
  }

  async execute(input: {
    conversationId?: string;
    message: string;
  }): Promise<SetupTurn> {
    const stored = await this.open(input.conversationId);
    // What the model is shown is finished before it is asked: the turn is
    // appended to a copy, so nothing this method does afterwards reaches back
    // into the request that has already gone out.
    const asked: readonly ModelMessage[] = [
      ...stored.transcript,
      { role: 'user', text: input.message },
    ];

    const response = await this.model.complete({
      system: systemPrompt(stored.state.section),
      messages: asked,
      tools: toolsFor(stored.state.section),
    });

    const transcript: ModelMessage[] = [
      ...asked,
      {
        role: 'assistant',
        text: response.text,
        toolCalls: response.toolCalls,
      },
    ];

    // A refusal is a well-formed answer the user is shown, not a failure the
    // wizard has to recover from.
    if (response.stopReason === 'refusal') {
      await this.save(stored, transcript, stored.state, []);
      return this.turn(stored.id, stored.state, {
        message: response.text,
        established: [],
        corrections: [],
        wasRefused: true,
      });
    }

    const outcome = this.applyCalls(stored.state, response.toolCalls);
    if (response.toolCalls.length > 0) {
      transcript.push({ role: 'toolResults', results: outcome.results });
    }

    await this.save(stored, transcript, outcome.state, outcome.established);

    return this.turn(stored.id, outcome.state, {
      message: this.say(response.text, outcome),
      established: outcome.established,
      corrections: outcome.corrections,
      wasRefused: false,
    });
  }

  private async open(
    id: string | undefined,
  ): Promise<StoredSetupConversation<SetupState, EstablishedRecord>> {
    if (id === undefined) {
      const today = LocalDate.fromInstant(this.clock.now());

      return {
        id: this.ids.next(),
        transcript: [],
        state: {
          // The cycle a due day has to fit is only knowable once the anchor
          // is, so the draft opens on today's calendar month and is rebuilt
          // on the resolved one the moment the anchor arrives.
          draft: SetupDraft.empty(calendarMonthOf(today), this.holidays),
          section: SetupSection.Anchor,
        },
        records: [],
      };
    }

    const stored = await this.conversations.load(id);
    if (stored === undefined) {
      throw new SetupConversationNotFound(
        `There is no setup conversation called "${id}".`,
      );
    }
    return stored;
  }

  private applyCalls(
    state: SetupState,
    calls: readonly ToolCall[],
  ): TurnOutcome {
    const established: EstablishedRecord[] = [];
    const corrections: string[] = [];
    const results: ToolResult[] = [];
    let current = state;

    const refuse = (call: ToolCall, reason: string): void => {
      corrections.push(reason);
      results.push({ callId: call.id, content: reason, isError: true });
    };

    for (const call of calls) {
      const section = current.section;
      if (section === undefined) {
        refuse(call, 'Everything is already recorded.');
        continue;
      }

      if (call.name === FINISH_TOOL.name) {
        if (section === SetupSection.Anchor) {
          refuse(call, `${LABELS[section]} cannot be skipped.`);
          continue;
        }
        current = {
          draft: settle(current.draft, section),
          section: after(section),
        };
        results.push({
          callId: call.id,
          content: 'Moving on.',
          isError: false,
        });
        continue;
      }

      const spec = TOOLS.find((candidate) => candidate.tool.name === call.name);
      if (spec?.section !== section) {
        refuse(
          call,
          spec === undefined
            ? `There is nothing called ${call.name} to call here.`
            : `${LABELS[spec.section]} is already settled, so nothing changed. Say explicitly that you want it changed and I will.`,
        );
        continue;
      }

      try {
        const extraction = spec.apply({
          draft: current.draft,
          args: call.arguments,
          holidays: this.holidays,
          clock: this.clock,
        });

        if (extraction.kind === 'missing') {
          refuse(call, extraction.question);
          continue;
        }

        current = {
          draft: extraction.draft,
          section: SINGULAR.includes(section) ? after(section) : section,
        };
        established.push({ section, summary: extraction.summary });
        results.push({
          callId: call.id,
          content: `Recorded. ${extraction.summary}`,
          isError: false,
        });
      } catch (error) {
        // Every rule belongs to the draft, so what it refuses is something to
        // say back rather than a failure: the draft is left exactly as it was.
        if (!(error instanceof DomainError)) throw error;
        refuse(call, error.message);
      }
    }

    return { state: current, established, corrections, results };
  }

  private say(text: string, outcome: TurnOutcome): string {
    if (outcome.corrections.length > 0) {
      return outcome.corrections.join(' ');
    }
    return text.trim() === '' ? nextQuestion(outcome.state.section) : text;
  }

  private turn(
    id: string,
    state: SetupState,
    said: {
      message: string;
      established: readonly EstablishedRecord[];
      corrections: readonly string[];
      wasRefused: boolean;
    },
  ): SetupTurn {
    return {
      conversationId: id,
      message: said.message,
      established: said.established,
      corrections: said.corrections,
      nextSection: state.section,
      isComplete: state.section === undefined && state.draft.isComplete,
      wasRefused: said.wasRefused,
    };
  }

  private async save(
    stored: StoredSetupConversation<SetupState, EstablishedRecord>,
    transcript: readonly ModelMessage[],
    state: SetupState,
    established: readonly EstablishedRecord[],
  ): Promise<void> {
    await this.conversations.save({
      id: stored.id,
      transcript,
      state,
      records: [...stored.records, ...established],
    });
  }
}

interface TurnOutcome {
  readonly state: SetupState;
  readonly established: readonly EstablishedRecord[];
  readonly corrections: readonly string[];
  readonly results: readonly ToolResult[];
}

/**
 * A record the draft will hold, or the question that has to be answered
 * before it can be built. An unanswered field is never filled in from what is
 * typical: a defaulted due day is a bill dated into the wrong cycle.
 */
type Extraction =
  | {
      readonly kind: 'record';
      readonly draft: SetupDraft;
      readonly summary: string;
    }
  | { readonly kind: 'missing'; readonly question: string };

interface ApplyContext {
  readonly draft: SetupDraft;
  readonly args: JsonObject;
  readonly holidays: HolidayCalendar;
  readonly clock: Clock;
}

interface ToolSpec {
  readonly section: SetupSection;
  readonly tool: ToolDeclaration;
  readonly apply: (context: ApplyContext) => Extraction;
}

/** Sections with exactly one answer, which the conversation leaves at once. */
const SINGULAR: readonly SetupSection[] = [
  SetupSection.Anchor,
  SetupSection.Salary,
];

const LABELS: Record<SetupSection, string> = {
  ANCHOR: 'The payday anchor',
  ACCOUNTS: 'The accounts',
  SALARY: 'The salary',
  FIXED_BILLS: 'The fixed bills',
  VARIABLE_BILLS: 'The variable bills',
  CARDS: 'The cards',
  BUCKETS: 'The buckets',
};

const FINISH_TOOL: ToolDeclaration = {
  name: 'finish_section',
  description:
    'Call this as soon as the user has nothing more to add to the section being asked about — including when they have none at all.',
  inputSchema: schema({}, []),
};

const RULE_QUESTION =
  'how much goes in each cycle — a percentage of Expected Surplus, or a fixed amount';

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

const TOOLS: readonly ToolSpec[] = [
  {
    section: SetupSection.Anchor,
    tool: {
      name: 'record_payday_anchor',
      description: 'Record the day of the month the salary lands.',
      inputSchema: schema(
        {
          dayOfMonth: dayField('the day of the month the salary lands'),
          shiftPolicy: {
            type: 'string',
            enum: [ShiftPolicy.Preceding, ShiftPolicy.Following],
            description:
              'Whether pay lands before or after a weekend or holiday. Leave out unless the user says.',
          },
        },
        ['dayOfMonth'],
      ),
    },
    apply: ({ args, holidays, clock }) => {
      const day = readInteger(args, 'dayOfMonth');
      if (day === undefined) {
        return missing(['the day of the month your salary lands']);
      }

      const policy =
        readChoice(args, 'shiftPolicy', [
          ShiftPolicy.Preceding,
          ShiftPolicy.Following,
        ]) ?? ShiftPolicy.Preceding;
      const anchor = PaydayAnchor.of(day, policy);

      // The anchor is the first thing asked, so the draft holds nothing else
      // yet and can be rebuilt on the month the anchor resolves today into —
      // which is what fixes the twelve cycles a due day has to fit.
      const startMonth = monthOf(
        LocalDate.fromInstant(clock.now()),
        anchor,
        holidays,
      );

      return {
        kind: 'record',
        draft: SetupDraft.empty(startMonth, holidays).withAnchor(anchor),
        summary: `Paid on day ${String(day)}, moving to the ${policy === ShiftPolicy.Preceding ? 'preceding' : 'following'} business day when that one is closed. Setup starts in the ${startMonth} cycle.`,
      };
    },
  },
  {
    section: SetupSection.Accounts,
    tool: {
      name: 'record_account',
      description: 'Record one account the user holds money in.',
      inputSchema: schema(
        {
          name: { type: 'string', description: "the account's name" },
          type: {
            type: 'string',
            enum: [AccountType.Checking, AccountType.Savings, AccountType.Cash],
            description: 'what kind of account it is',
          },
          balanceInCents: centsField('what is in it right now'),
        },
        ['name'],
      ),
    },
    apply: ({ draft, args }) => {
      const name = readText(args, 'name');
      const type = readChoice(args, 'type', [
        AccountType.Checking,
        AccountType.Savings,
        AccountType.Cash,
      ]);
      const balance = readCents(args, 'balanceInCents');

      if (name === undefined) return missing(["the account's name"]);
      const unanswered = [
        ...(type === undefined
          ? ['whether it is checking, savings or cash']
          : []),
        ...(balance === undefined ? ['what is in it right now'] : []),
      ];
      if (type === undefined || balance === undefined) {
        return missing(unanswered, name);
      }

      return {
        kind: 'record',
        draft: draft.addAccount({ name, type, balance }),
        summary: `${name} — a ${type.toLowerCase()} account holding R$ ${balance.toReais()}.`,
      };
    },
  },
  {
    section: SetupSection.Salary,
    tool: {
      name: 'record_salary',
      // The payday anchor already dates it — UC-2.2. Asking again could only
      // produce an answer that disagrees with the cycle boundary itself.
      description:
        'Record the salary that arrives each cycle. Its date is the payday anchor and is never asked for.',
      inputSchema: schema(
        { amountInCents: centsField('the salary each cycle') },
        ['amountInCents'],
      ),
    },
    apply: ({ draft, args }) => {
      const amount = readCents(args, 'amountInCents');
      if (amount === undefined) return missing(['what your salary is']);

      return {
        kind: 'record',
        draft: draft.withSalary(amount),
        summary: `Salary of R$ ${amount.toReais()} each cycle, dated by the payday anchor.`,
      };
    },
  },
  billSpec(SetupSection.FixedBills, {
    name: 'record_fixed_bill',
    description:
      'Record one bill of the same amount every cycle — rent, a health plan, a subscription.',
  }),
  billSpec(SetupSection.VariableBills, {
    name: 'record_variable_bill',
    description:
      'Record one bill whose amount moves from cycle to cycle — electricity, groceries. These count as estimates unless the user says the figure is confirmed.',
  }),
  {
    section: SetupSection.Cards,
    tool: {
      name: 'record_card',
      description: 'Record one credit card.',
      inputSchema: schema(
        {
          name: { type: 'string', description: "the card's name" },
          limitInCents: centsField('the credit limit'),
          closingDay: dayField('the day of the month the invoice closes'),
          dueDay: dayField('the day of the month the invoice falls due'),
          paymentAccountName: {
            type: 'string',
            description: 'the name of the account the invoice is paid from',
          },
        },
        ['name'],
      ),
    },
    apply: ({ draft, args }) => {
      const name = readText(args, 'name');
      if (name === undefined) return missing(["the card's name"]);

      const limit = readCents(args, 'limitInCents');
      const closingDay = readInteger(args, 'closingDay');
      const dueDay = readInteger(args, 'dueDay');
      const paymentAccountName = readText(args, 'paymentAccountName');

      const unanswered = [
        ...(limit === undefined ? ['the credit limit'] : []),
        ...(closingDay === undefined ? ['the day the invoice closes'] : []),
        ...(dueDay === undefined ? ['the day the invoice falls due'] : []),
        ...(paymentAccountName === undefined ? ['which account pays it'] : []),
      ];
      if (
        limit === undefined ||
        closingDay === undefined ||
        dueDay === undefined ||
        paymentAccountName === undefined
      ) {
        return missing(unanswered, name);
      }

      return {
        kind: 'record',
        draft: draft.addCard({
          name,
          limit,
          closingDay,
          dueDay,
          paymentAccountName,
        }),
        summary: `${name} — limit R$ ${limit.toReais()}, closing on day ${String(closingDay)}, due on day ${String(dueDay)}, paid from ${paymentAccountName}.`,
      };
    },
  },
  {
    section: SetupSection.Buckets,
    tool: {
      name: 'record_ongoing_bucket',
      description:
        'Record a pot of savings with no finish line — a brokerage contribution, a monthly top-up.',
      inputSchema: schema(
        {
          name: { type: 'string', description: "the bucket's name" },
          ...RULE_FIELDS,
        },
        ['name'],
      ),
    },
    apply: ({ draft, args }) => {
      const name = readText(args, 'name');
      if (name === undefined) return missing(["the bucket's name"]);

      const rule = allocationRule(args);
      if (rule === undefined) return missing([RULE_QUESTION], name);

      const priority = nextPriority(draft);

      return {
        kind: 'record',
        draft: draft.addOngoingBucket({ name, rule, priority }),
        summary: `${name} — ${describeRule(rule)} each cycle, funded #${String(priority)}.`,
      };
    },
  },
  {
    section: SetupSection.Buckets,
    tool: {
      name: 'record_goal_bucket',
      description:
        'Record a pot of savings with a target amount and a date to reach it by.',
      inputSchema: schema(
        {
          name: { type: 'string', description: "the bucket's name" },
          ...RULE_FIELDS,
          targetAmountInCents: centsField('the amount to reach'),
          targetDate: {
            type: 'string',
            description: 'the date to reach it by, as YYYY-MM-DD',
          },
        },
        ['name'],
      ),
    },
    apply: ({ draft, args }) => {
      const name = readText(args, 'name');
      if (name === undefined) return missing(["the bucket's name"]);

      const rule = allocationRule(args);
      const target = readCents(args, 'targetAmountInCents');
      const date = readDate(args, 'targetDate');

      const unanswered = [
        ...(rule === undefined ? [RULE_QUESTION] : []),
        ...(target === undefined ? ['the amount to reach'] : []),
        ...(date === undefined ? ['the date to reach it by'] : []),
      ];
      if (rule === undefined || target === undefined || date === undefined) {
        return missing(unanswered, name);
      }

      const priority = nextPriority(draft);

      return {
        kind: 'record',
        draft: draft.addGoalBucket({
          name,
          rule,
          priority,
          target: { amount: target, date },
        }),
        summary: `${name} — ${describeRule(rule)} each cycle toward R$ ${target.toReais()} by ${date.toISO()}, funded #${String(priority)}.`,
      };
    },
  },
];

function billSpec(
  section: SetupSection,
  tool: { name: string; description: string },
): ToolSpec {
  return {
    section,
    tool: {
      ...tool,
      inputSchema: schema(
        {
          name: { type: 'string', description: "the bill's name" },
          amountInCents: centsField('what it costs each cycle'),
          // Optional on purpose. Strict tool use never omits a required
          // field, so requiring this would have a model that was told
          // nothing invent a day — and a bill dated wrong lands in the wrong
          // cycle, which is the error UC-5.4 exists to prevent.
          dueDayOfMonth: dayField(
            'the day of the month it falls due. Leave it out when the user has not said which day',
          ),
          isEstimate: {
            type: 'boolean',
            description:
              'true when the amount is a guess rather than a known figure',
          },
        },
        ['name', 'amountInCents'],
      ),
    },
    apply: ({ draft, args }) => {
      const name = readText(args, 'name');
      const amount = readCents(args, 'amountInCents');
      if (name === undefined || amount === undefined) {
        return missing(["the bill's name and what it costs"]);
      }

      const dueDayOfMonth = readInteger(args, 'dueDayOfMonth');
      if (dueDayOfMonth === undefined) {
        return missing(['the day of the month it falls due'], name);
      }

      const isEstimate = readFlag(args, 'isEstimate');
      const proposed = {
        name,
        amount,
        dueDayOfMonth,
        ...(isEstimate === undefined ? {} : { isEstimate }),
      };
      const updated =
        section === SetupSection.FixedBills
          ? draft.addFixedBill(proposed)
          : draft.addVariableBill(proposed);
      // Read back rather than recomputed: whether an unstated flag makes a
      // bill an estimate is the draft's rule (UC-2.6), and a second copy of it
      // here would be a summary that could disagree with what was recorded.
      const recorded =
        section === SetupSection.FixedBills
          ? updated.fixedBills
          : updated.variableBills;
      const bill = recorded[recorded.length - 1];

      return {
        kind: 'record',
        draft: updated,
        summary: `${name} — R$ ${amount.abs().toReais()} on day ${String(dueDayOfMonth)}${bill?.isEstimate === true ? ', an estimate' : ''}.`,
      };
    },
  };
}

function allocationRule(args: JsonObject): AllocationRule | undefined {
  const percentage = readPercent(args, 'percentOfExpectedSurplus');
  if (percentage !== undefined) {
    return Allocation.percentOfExpectedSurplus(percentage);
  }

  const amount = readCents(args, 'fixedAmountInCents');
  return amount === undefined ? undefined : Allocation.fixed(amount);
}

function describeRule(rule: AllocationRule): string {
  return rule.kind === 'PERCENT'
    ? `${rule.percentage.toString()} of Expected Surplus`
    : `R$ ${rule.amount.toReais()}`;
}

/** The lowest order nobody holds: the user is asked about order, not made to. */
function nextPriority(draft: SetupDraft): number {
  const taken = new Set(draft.buckets.map((bucket) => bucket.priority));

  let priority = 1;
  while (taken.has(priority)) priority += 1;
  return priority;
}

function settle(draft: SetupDraft, section: SetupSection): SetupDraft {
  return draft.remainingSections.includes(section)
    ? draft.skip(section)
    : draft;
}

function after(section: SetupSection): SetupSection | undefined {
  return SETUP_SECTIONS[SETUP_SECTIONS.indexOf(section) + 1];
}

function toolsFor(section: SetupSection | undefined): ToolDeclaration[] {
  if (section === undefined) return [];

  const offered = TOOLS.filter((spec) => spec.section === section).map(
    (spec) => spec.tool,
  );

  return section === SetupSection.Anchor ? offered : [...offered, FINISH_TOOL];
}

function missing(what: readonly string[], subject?: string): Extraction {
  const list = joinWithAnd(what);

  return {
    kind: 'missing',
    question:
      subject === undefined
        ? `I still need ${list}.`
        : `I still need ${list} for ${subject}.`,
  };
}

function joinWithAnd(parts: readonly string[]): string {
  return parts.join(', ').replace(/, ([^,]*)$/, ' and $1');
}

/**
 * `null` and an absent key both mean the user has not said. A model filling an
 * optional field with `null` rather than leaving it out is common enough —
 * observed on a local model behind this port — that reading the two
 * differently would let an unanswered field through as a value.
 */
function stated(args: JsonObject, field: string): JsonValue | undefined {
  const value = args[field];
  return value === null ? undefined : value;
}

function readText(args: JsonObject, field: string): string | undefined {
  const value = stated(args, field);
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return value.trim();
}

/** A number the model produced is validated like any other input. */
function readInteger(args: JsonObject, field: string): number | undefined {
  const value = stated(args, field);
  return typeof value === 'number' && Number.isSafeInteger(value)
    ? value
    : undefined;
}

function readCents(args: JsonObject, field: string): Money | undefined {
  const value = readInteger(args, field);
  return value === undefined ? undefined : Money.fromCents(value);
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

function readPercent(args: JsonObject, field: string): Percentage | undefined {
  const value = stated(args, field);
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  // Basis points are the finest a percentage is held in, so a figure with more
  // decimals than that is rounded rather than refused.
  return Percentage.ofBasisPoints(Math.round(value * 100));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function readDate(args: JsonObject, field: string): LocalDate | undefined {
  const value = readText(args, field);
  return value !== undefined && ISO_DATE.test(value)
    ? LocalDate.parse(value)
    : undefined;
}

function schema(
  properties: JsonObject,
  required: readonly string[],
): JsonObject {
  return {
    type: 'object',
    properties,
    required: [...required],
    // Strict tool use wants it, and it is what turns a hallucinated field into
    // a rejected call rather than a record with something extra in it.
    additionalProperties: false,
  };
}

function dayField(description: string): JsonObject {
  return { type: 'integer', minimum: 1, maximum: 31, description };
}

function centsField(description: string): JsonObject {
  return {
    type: 'integer',
    description: `${description}, in whole cents — R$ 1.234,56 is 123456`,
  };
}

const ROLE = `You are the setup assistant of Financial Control, a personal budgeting application with a single user. You are collecting what the app needs before it can show anything, one section at a time.

Ask about one thing at a time and keep every message short. Record what the user tells you by calling the tool for the section being asked about, once per item, and call finish_section as soon as they have nothing more to add to it.

Leave a field out when the user has not said it, and ask about it instead — never fill one in from what is typical. Amounts are Brazilian Real in whole cents: R$ 1.234,56 is 123456.`;

const BRIEFINGS: Record<SetupSection, string> = {
  ANCHOR:
    'You are on the payday anchor: the day of the month the salary lands. Every cycle in the app is measured from it, and it cannot be skipped.',
  ACCOUNTS:
    'You are on accounts: where the money actually sits — checking, savings or cash — and what is in each right now.',
  SALARY:
    'You are on the salary: how much arrives each cycle. Never ask which day it arrives; the payday anchor already answered that.',
  FIXED_BILLS:
    'You are on fixed bills: the ones that cost the same every cycle, each with the day of the month it falls due.',
  VARIABLE_BILLS:
    'You are on variable bills: the ones whose amount moves, each with the day of the month it falls due.',
  CARDS:
    'You are on credit cards: the limit, the day the invoice closes, the day it falls due, and which account pays it.',
  BUCKETS:
    'You are on savings buckets: either a goal with a target and a date, or an ongoing contribution with neither, and how much goes in each cycle.',
};

const QUESTIONS: Record<SetupSection, string> = {
  ANCHOR: 'Which day of the month does your salary land?',
  ACCOUNTS: 'Which accounts do you keep money in, and how much is in each?',
  SALARY: 'How much is your salary each cycle?',
  FIXED_BILLS: 'Which bills cost the same every cycle, and on which day?',
  VARIABLE_BILLS: 'Which bills change from cycle to cycle, and on which day?',
  CARDS: 'Which credit cards do you use?',
  BUCKETS: 'What are you saving toward, and how much goes in each cycle?',
};

function systemPrompt(section: SetupSection | undefined): string {
  return section === undefined
    ? `${ROLE}\n\nEverything is recorded. Tell the user you are ready to set the app up.`
    : `${ROLE}\n\n${BRIEFINGS[section]}`;
}

function nextQuestion(section: SetupSection | undefined): string {
  return section === undefined
    ? 'That is everything I need — shall I set the app up?'
    : QUESTIONS[section];
}
