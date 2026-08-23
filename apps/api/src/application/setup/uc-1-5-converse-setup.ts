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
import type { Principal } from '../../domain/shared/principal.js';
import { calendarMonthOf, monthOf } from '../budgeting/month.js';
import type { SpendCeiling } from '../spend/spend-ceiling.js';

import type { RecordCorrection } from './record-correction.js';
import { applyCorrection, describeRule } from './record-correction.js';
import {
  DueDayOutsideCycle,
  SETUP_SECTIONS,
  SetupDraft,
  SetupSection,
} from './setup-draft.js';

export class SetupConversationNotFound extends DomainError {}
export class SetupMessageTooLong extends DomainError {}
export class SetupConversationTooLong extends DomainError {}

/**
 * What one setup conversation may cost.
 *
 * Injected rather than read here so the whole cost surface — which model
 * answers, how much it may write, how much may be said to it in one message
 * and how long a conversation may run — sits in one place beside the model
 * choices (`infrastructure/anthropic/models.ts`).
 */
export interface SetupLimits {
  /** Of the message the user typed, after trimming. */
  readonly maxMessageCharacters: number;
  /** Counted from the transcript the server holds, never from the client. */
  readonly maxTurnsPerConversation: number;
}

/** One thing the conversation established, in the user's own terms. */
export interface EstablishedRecord {
  readonly section: SetupSection;
  /**
   * What a correction names it by. Absent for the sections that hold a single
   * value — the anchor and the salary are answered again rather than
   * corrected, so there is never a second one to tell apart.
   */
  readonly id: string | undefined;
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
  /** The ids of the records this turn dropped — UC-1.5. */
  readonly removed: readonly string[];
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
    private readonly spend: SpendCeiling,
    private readonly ids: IdSource,
    private readonly holidays: HolidayCalendar,
    private readonly clock: Clock,
    private readonly limits: SetupLimits,
  ) {}

  /**
   * Whether a conversation can be had at all. Read from the model itself so
   * that what the app reports up front and what a turn would fail with are the
   * same fact rather than two that can drift apart.
   */
  get isAvailable(): boolean {
    return this.model.isAvailable;
  }

  /**
   * The principal is a separate argument from the message because identity is
   * ambient: it comes from whatever knows who is calling, never from the body
   * that was sent. It is what the day's spend is counted against.
   */
  async execute(
    principal: Principal,
    input: {
      conversationId?: string;
      message: string;
    },
  ): Promise<SetupTurn> {
    // Every cap here is a rejection, never a truncation. Extracting records
    // from half of what somebody wrote would record half a sentence as fact,
    // and they would never learn which half.
    const message = input.message.trim();
    if (message.length > this.limits.maxMessageCharacters) {
      throw new SetupMessageTooLong(
        `An answer may be ${String(this.limits.maxMessageCharacters)} characters long; this one is ${String(message.length)}. Nothing was sent to the model — send it in more than one answer and I will record each.`,
      );
    }

    // Before the request, never after: refusing a call already paid for would
    // bound nothing at all.
    await this.spend.check(principal);

    const stored = await this.open(input.conversationId);
    if (turnsOf(stored) >= this.limits.maxTurnsPerConversation) {
      throw new SetupConversationTooLong(
        `This setup conversation has had the ${String(this.limits.maxTurnsPerConversation)} turns one may have. Everything it recorded is still held, to correct or to apply — it just cannot go on.`,
      );
    }

    // What the model is shown is finished before it is asked: the turn is
    // appended to a copy, so nothing this method does afterwards reaches back
    // into the request that has already gone out.
    const asked: readonly ModelMessage[] = [
      ...stored.transcript,
      { role: 'user', text: message },
    ];

    const tools = toolsFor(stored.state);
    const response = await this.model.complete({
      system: systemPrompt(stored.state, tools),
      messages: asked,
      tools,
    });

    await this.spend.record(principal, response.usage);

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
      await this.save(stored, transcript, stored.state, [], []);
      return this.turn(stored.id, stored.state, {
        message: response.text,
        established: [],
        removed: [],
        corrections: [],
        wasRefused: true,
      });
    }

    const outcome = this.applyCalls(stored.state, response.toolCalls);
    if (response.toolCalls.length > 0) {
      transcript.push({ role: 'toolResults', results: outcome.results });
    }

    await this.save(
      stored,
      transcript,
      outcome.state,
      outcome.established,
      outcome.removed,
    );

    return this.turn(stored.id, outcome.state, {
      message: this.say(response.text, outcome),
      established: outcome.established,
      removed: outcome.removed,
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
          draft: SetupDraft.empty(
            calendarMonthOf(today),
            this.holidays,
            this.ids,
          ),
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
    const removed: string[] = [];
    const corrections: string[] = [];
    const results: ToolResult[] = [];
    let current = state;

    // The hint goes to the model and not to the user: what to call next is
    // this interactor's vocabulary, and the user is being asked a question
    // about their own bill.
    const refuse = (call: ToolCall, reason: string, hint = ''): void => {
      corrections.push(reason);
      results.push({
        callId: call.id,
        content: `${reason}${hint}`,
        isError: true,
      });
    };

    for (const call of calls) {
      if (call.name === CORRECT_TOOL.name || call.name === REMOVE_TOOL.name) {
        try {
          const outcome =
            call.name === CORRECT_TOOL.name
              ? correct(current.draft, call.arguments)
              : drop(current.draft, call.arguments);

          if (outcome.kind === 'missing') {
            refuse(call, outcome.question);
            continue;
          }

          // The cursor stays where it is. The record being corrected may
          // belong to a section already settled, and going back to it would
          // restart the conversation the correction is meant to fit into.
          current = { ...current, draft: outcome.draft };

          if (outcome.kind === 'dropped') {
            removed.push(outcome.id);
            results.push({
              callId: call.id,
              content: `Dropped ${outcome.summary}.`,
              isError: false,
            });
            continue;
          }

          established.push({
            section: outcome.section,
            id: outcome.id,
            summary: outcome.summary,
          });
          results.push({
            callId: call.id,
            content: `Corrected. ${outcome.summary}`,
            isError: false,
          });
        } catch (error) {
          if (!(error instanceof DomainError)) throw error;
          refuse(call, error.message, hintFor(error));
        }
        continue;
      }

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
            : `${LABELS[spec.section]} is already settled, so nothing changed. I can correct or drop a record already recorded — tell me which one.`,
        );
        continue;
      }

      try {
        const extraction = spec.apply({
          draft: current.draft,
          args: call.arguments,
          holidays: this.holidays,
          clock: this.clock,
          ids: this.ids,
        });

        if (extraction.kind === 'missing') {
          refuse(call, extraction.question);
          continue;
        }

        const id = establishedId(current.draft, extraction.draft);
        current = {
          draft: extraction.draft,
          section: SINGULAR.includes(section) ? after(section) : section,
        };
        established.push({ section, id, summary: extraction.summary });
        results.push({
          callId: call.id,
          // The id travels back so the model can name the record in a
          // correction: nothing else in the conversation carries one.
          content:
            id === undefined
              ? `Recorded. ${extraction.summary}`
              : `Recorded as ${id}. ${extraction.summary}`,
          isError: false,
        });
      } catch (error) {
        // Every rule belongs to the draft, so what it refuses is something to
        // say back rather than a failure: the draft is left exactly as it was.
        if (!(error instanceof DomainError)) throw error;
        refuse(call, error.message, hintFor(error));
      }
    }

    return {
      state: withSomethingLeftToAsk(current),
      established,
      removed,
      corrections,
      results,
    };
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
      removed: readonly string[];
      corrections: readonly string[];
      wasRefused: boolean;
    },
  ): SetupTurn {
    return {
      conversationId: id,
      message: said.message,
      established: said.established,
      removed: said.removed,
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
    removed: readonly string[],
  ): Promise<void> {
    await this.conversations.save({
      id: stored.id,
      transcript,
      state,
      records: accumulate(stored.records, established, removed),
    });
  }
}

/**
 * What this conversation has already spent, counted where the client cannot
 * reach. Assistant lines rather than user ones: exactly one is written per
 * model call, while a correction (UC-1.5) writes a user line without reaching
 * a model at all — counting those would have the free path spend the budget
 * of the paid one.
 */
function turnsOf(
  stored: StoredSetupConversation<SetupState, EstablishedRecord>,
): number {
  return stored.transcript.filter((message) => message.role === 'assistant')
    .length;
}

interface TurnOutcome {
  readonly state: SetupState;
  readonly established: readonly EstablishedRecord[];
  readonly removed: readonly string[];
  readonly corrections: readonly string[];
  readonly results: readonly ToolResult[];
}

/**
 * A correction updates the record it corrects rather than adding a second
 * account of it, and a removal takes it out: what the client shows back has to
 * be what the draft actually holds.
 */
export function accumulate(
  existing: readonly EstablishedRecord[],
  established: readonly EstablishedRecord[],
  removed: readonly string[],
): EstablishedRecord[] {
  const kept = existing.filter(
    (record) => record.id === undefined || !removed.includes(record.id),
  );
  const corrected = kept.map(
    (record) =>
      established.find((next) => keyOf(next) === keyOf(record)) ?? record,
  );
  const added = established.filter(
    (next) => !kept.some((record) => keyOf(record) === keyOf(next)),
  );

  return [...corrected, ...added];
}

/** The anchor and the salary hold one record each, so their section is it. */
function keyOf(record: EstablishedRecord): string {
  return record.id ?? `section:${record.section}`;
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
  readonly ids: IdSource;
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

/**
 * What taking the offer is called, in the model's vocabulary — FIN-117. It is
 * never set from a refusal alone: the user has to agree, because the fallback
 * moves one cycle's date off the day they gave.
 */
const FALLBACK_FIELD = 'acceptCycleLastDay';

const FALLBACK_HINT = ` Put that to the user, and only once they agree call the tool again with the same day and ${FALLBACK_FIELD} set to true. Never set it on your own.`;

function hintFor(error: DomainError): string {
  return error instanceof DueDayOutsideCycle ? FALLBACK_HINT : '';
}

const FALLBACK_FLAG: JsonObject = {
  [FALLBACK_FIELD]: {
    type: 'boolean',
    description:
      "true only when the user has agreed to use the cycle's last day in the cycles that cannot reach the due day. The due day itself stays as they gave it",
  },
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

/**
 * UC-1.5 — extraction is a model reading prose, so a record is shown back to
 * be corrected. Both tools address a record by the id the draft gave it: a
 * name would be ambiguous the moment there are two bills called the same
 * thing, and a mis-hearing would rewrite the wrong row.
 */
const CORRECT_TOOL: ToolDeclaration = {
  name: 'correct_record',
  description:
    'Change something about a record already recorded — its amount, its day, its name. Name it by the id the recording came back with and pass only the fields that change. Works for a record from any section, including one already finished.',
  inputSchema: schema(
    {
      recordId: {
        type: 'string',
        description: 'the id the record was recorded under',
      },
      name: { type: 'string', description: "the record's name" },
      type: {
        type: 'string',
        enum: [AccountType.Checking, AccountType.Savings, AccountType.Cash],
        description: 'for an account: what kind of account it is',
      },
      balanceInCents: centsField('for an account: what is in it right now'),
      amountInCents: centsField('for a bill: what it costs each cycle'),
      dueDayOfMonth: dayField('for a bill: the day of the month it falls due'),
      isEstimate: {
        type: 'boolean',
        description:
          'for a bill: true when the amount is a guess rather than a known figure',
      },
      ...FALLBACK_FLAG,
      limitInCents: centsField('for a card: the credit limit'),
      closingDay: dayField('for a card: the day the invoice closes'),
      dueDay: dayField('for a card: the day the invoice falls due'),
      paymentAccountName: {
        type: 'string',
        description: 'for a card: the account the invoice is paid from',
      },
      ...RULE_FIELDS,
      targetAmountInCents: centsField('for a goal bucket: the amount to reach'),
      targetDate: {
        type: 'string',
        description:
          'for a goal bucket: the date to reach it by, as YYYY-MM-DD',
      },
    },
    ['recordId'],
  ),
};

const REMOVE_TOOL: ToolDeclaration = {
  name: 'remove_record',
  description:
    'Drop a record that should not be there at all, by the id it was recorded under. This is not the same as the user having none of that kind: for that, call finish_section.',
  inputSchema: schema(
    {
      recordId: {
        type: 'string',
        description: 'the id the record was recorded under',
      },
    },
    ['recordId'],
  ),
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
    apply: ({ args, holidays, clock, ids }) => {
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
        draft: SetupDraft.empty(startMonth, holidays, ids).withAnchor(anchor),
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

/** What a correction turn produced, or the question standing in its way. */
type Correction =
  | {
      readonly kind: 'corrected';
      readonly draft: SetupDraft;
      readonly section: SetupSection;
      readonly id: string;
      readonly summary: string;
    }
  | {
      readonly kind: 'dropped';
      readonly draft: SetupDraft;
      readonly id: string;
      readonly summary: string;
    }
  | { readonly kind: 'missing'; readonly question: string };

function correct(draft: SetupDraft, args: JsonObject): Correction {
  const id = readText(args, 'recordId');
  if (id === undefined) {
    return {
      kind: 'missing',
      question: 'I need to know which record to change.',
    };
  }

  const held = draft.find(id);
  if (held === undefined) return notHolding(id);

  const corrected = applyCorrection(draft, id, held, readCorrection(args));
  if (corrected === undefined) {
    return {
      kind: 'missing',
      question: `I still need to know what to change about ${held.record.name}.`,
    };
  }

  return {
    kind: 'corrected',
    draft: corrected.draft,
    section: held.section,
    id,
    summary: corrected.summary,
  };
}

/**
 * The `correct_record` call's arguments as a {@link RecordCorrection}. The
 * tool schema is the model's vocabulary — cents, days, a percentage — and
 * this is the whole of the difference between the conversational path and the
 * structured one: everything after it is shared.
 */
function readCorrection(args: JsonObject): RecordCorrection {
  return {
    name: readText(args, 'name'),
    type: readChoice(args, 'type', [
      AccountType.Checking,
      AccountType.Savings,
      AccountType.Cash,
    ]),
    balance: readCents(args, 'balanceInCents'),
    amount: readCents(args, 'amountInCents'),
    dueDayOfMonth: readInteger(args, 'dueDayOfMonth'),
    isEstimate: readFlag(args, 'isEstimate'),
    acceptCycleFallback: readFlag(args, FALLBACK_FIELD),
    limit: readCents(args, 'limitInCents'),
    closingDay: readInteger(args, 'closingDay'),
    dueDay: readInteger(args, 'dueDay'),
    paymentAccountName: readText(args, 'paymentAccountName'),
    rule: allocationRule(args),
    targetAmount: readCents(args, 'targetAmountInCents'),
    targetDate: readDate(args, 'targetDate'),
  };
}

function drop(draft: SetupDraft, args: JsonObject): Correction {
  const id = readText(args, 'recordId');
  if (id === undefined) {
    return {
      kind: 'missing',
      question: 'I need to know which record to drop.',
    };
  }

  const held = draft.find(id);
  if (held === undefined) return notHolding(id);

  return {
    kind: 'dropped',
    draft: draft.remove(id),
    id,
    summary: held.record.name,
  };
}

function notHolding(id: string): Correction {
  return {
    kind: 'missing',
    question: `I am holding nothing recorded as ${id}, so nothing changed.`,
  };
}

/**
 * The record the draft did not hold before. The specs hand the draft a record
 * without an id — the draft issues it — so this is where the turn learns what
 * a later correction has to name.
 */
function establishedId(
  before: SetupDraft,
  after: SetupDraft,
): string | undefined {
  const known = new Set(before.records.map((held) => held.record.id));

  return after.records.find((held) => !known.has(held.record.id))?.record.id;
}

/**
 * Dropping the last record of a section the conversation has already passed
 * leaves it unanswered again. The cursor never moves backwards while there is
 * still something ahead of it, but a conversation with nothing left to ask and
 * a draft that cannot compose would otherwise be stuck.
 */
export function withSomethingLeftToAsk(state: SetupState): SetupState {
  return state.section === undefined && !state.draft.isComplete
    ? { ...state, section: state.draft.nextSection }
    : state;
}

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
          ...FALLBACK_FLAG,
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
      const acceptCycleFallback = readFlag(args, FALLBACK_FIELD);
      const proposed = {
        name,
        amount,
        dueDayOfMonth,
        ...(isEstimate === undefined ? {} : { isEstimate }),
        ...(acceptCycleFallback === undefined ? {} : { acceptCycleFallback }),
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

/**
 * The correction tools are offered only once the draft holds something to
 * correct, which keeps them out of the first turns — where there is nothing
 * they could name.
 */
function toolsFor(state: SetupState): ToolDeclaration[] {
  const corrections =
    state.draft.records.length > 0 ? [CORRECT_TOOL, REMOVE_TOOL] : [];
  const section = state.section;
  if (section === undefined) return corrections;

  const offered = TOOLS.filter((spec) => spec.section === section).map(
    (spec) => spec.tool,
  );

  return section === SetupSection.Anchor
    ? [...offered, ...corrections]
    : [...offered, FINISH_TOOL, ...corrections];
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

const CORRECTIONS = `Every record you take comes back with an id. When the user says something already recorded is wrong, call correct_record with that id and only the fields that change; when it should not be there at all, call remove_record with it. Both work for a record from any section, including one already finished, and neither goes back to it.`;

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

function systemPrompt(
  state: SetupState,
  tools: readonly ToolDeclaration[],
): string {
  const corrections = tools.some((tool) => tool.name === CORRECT_TOOL.name)
    ? `\n\n${CORRECTIONS}`
    : '';
  const briefing =
    state.section === undefined
      ? 'Everything is recorded. Tell the user you are ready to set the app up.'
      : BRIEFINGS[state.section];

  return `${ROLE}\n\n${briefing}${corrections}`;
}

function nextQuestion(section: SetupSection | undefined): string {
  return section === undefined
    ? 'That is everything I need — shall I set the app up?'
    : QUESTIONS[section];
}
