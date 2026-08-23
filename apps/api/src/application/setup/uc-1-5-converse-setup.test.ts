import { describe, expect, it } from 'vitest';

import { Allocation } from '../../domain/goals/bucket.js';
import { noHolidays } from '../../domain/ports/holiday-calendar.js';
import type {
  JsonObject,
  ToolCall,
} from '../../domain/ports/language-model.js';
import { LocalDate } from '../../domain/shared/local-date.js';
import { Money } from '../../domain/shared/money.js';
import { Principal } from '../../domain/shared/principal.js';
import type { ScriptedTurn } from '../testing/fake-language-model.js';
import { FakeLanguageModel } from '../testing/fake-language-model.js';
import { SpendCeiling, SpendCeilingReached } from '../spend/spend-ceiling.js';
import {
  FakeSetupConversationStore,
  FakeSpendLedger,
  SequentialIdSource,
} from '../testing/fakes.js';
import { FixedClock } from '../testing/fixed-clock.js';

import { composeSetup } from './compose-setup.js';
import { SetupDraft, SetupSection } from './setup-draft.js';
import type {
  SetupConversations,
  SetupLimits,
} from './uc-1-5-converse-setup.js';
import {
  ConverseSetup,
  SetupConversationNotFound,
  SetupConversationTooLong,
  SetupMessageTooLong,
} from './uc-1-5-converse-setup.js';

const NOW = '2026-08-19T09:00:00.000Z';

let issued = 0;
const call = (name: string, args: JsonObject = {}): ToolCall => {
  issued += 1;
  return { id: `call-${String(issued)}`, name, arguments: args };
};

const done = () => call('finish_section');

/** The one user this app has, supplied by the caller as identity always is. */
const me = Principal.sole();

/** The day the fixed clock stands on, which is the day the ledger counts. */
const today = LocalDate.parse('2026-08-19');

/** Far above anything a test spends, unless the test is about the ceiling. */
const NO_CEILING = 1_000_000;

/** Far above anything this suite sends, unless the test is about the caps. */
const NO_LIMITS: SetupLimits = {
  maxMessageCharacters: 10_000,
  maxTurnsPerConversation: 1_000,
};

const wire = (
  script: readonly ScriptedTurn[],
  budget: {
    ledger?: FakeSpendLedger;
    maxTokensPerDay?: number;
    limits?: SetupLimits;
  } = {},
) => {
  const model = new FakeLanguageModel(script);
  const conversations: SetupConversations = new FakeSetupConversationStore();
  const ledger = budget.ledger ?? new FakeSpendLedger();
  const clock = FixedClock.at(NOW);
  const spend = new SpendCeiling(
    ledger,
    clock,
    budget.maxTokensPerDay ?? NO_CEILING,
  );

  return {
    model,
    conversations,
    ledger,
    converse: new ConverseSetup(
      model,
      conversations,
      spend,
      new SequentialIdSource('conv'),
      noHolidays,
      clock,
      budget.limits ?? NO_LIMITS,
    ),
  };
};

async function draftOf(
  conversations: SetupConversations,
  id: string,
): Promise<SetupDraft> {
  const stored = await conversations.load(id);
  if (stored === undefined) {
    throw new Error(`The store is not holding ${id}.`);
  }
  return stored.state.draft;
}

const anchorTurn: ScriptedTurn = {
  text: 'Noted.',
  toolCalls: [call('record_payday_anchor', { dayOfMonth: 5 })],
};

const accountTurn: ScriptedTurn = {
  text: 'Got it.',
  toolCalls: [
    call('record_account', {
      name: 'Checking',
      type: 'CHECKING',
      balanceInCents: 216_000,
    }),
    done(),
  ],
};

const salaryTurn: ScriptedTurn = {
  text: 'Thanks.',
  toolCalls: [call('record_salary', { amountInCents: 1_800_000 })],
};

const healthPlan = (extra: JsonObject = {}) =>
  call('record_fixed_bill', {
    name: 'Health Plan',
    amountInCents: 32_000,
    ...extra,
  });

/** A bill on a day three of the twelve cycles cannot reach — FIN-117. */
const gymTurn = (extra: JsonObject = {}): ScriptedTurn => ({
  text: 'Recorded.',
  toolCalls: [
    call('record_fixed_bill', {
      name: 'Gym',
      amountInCents: 12_000,
      dueDayOfMonth: 4,
      ...extra,
    }),
  ],
});

/** Anchor, account, salary — the three sections everything else needs. */
const OPENING: ScriptedTurn[] = [anchorTurn, accountTurn, salaryTurn];

const nothingHere: ScriptedTurn = {
  text: 'Nothing there.',
  toolCalls: [done()],
};

/** Everything up to, and stopping on, the section each one names. */
const TO_VARIABLE_BILLS = [...OPENING, nothingHere];
const TO_CARDS = [...TO_VARIABLE_BILLS, nothingHere];
const TO_BUCKETS = [...TO_CARDS, nothingHere];

const WHOLE_SETUP: ScriptedTurn[] = [
  ...OPENING,
  { text: 'Recorded.', toolCalls: [healthPlan({ dueDayOfMonth: 8 }), done()] },
  {
    text: 'Recorded.',
    toolCalls: [
      call('record_variable_bill', {
        name: 'Electricity',
        amountInCents: 28_000,
        dueDayOfMonth: 15,
      }),
      done(),
    ],
  },
  {
    text: 'Recorded.',
    toolCalls: [
      call('record_card', {
        name: 'Inter',
        limitInCents: 1_000_000,
        closingDay: 28,
        dueDay: 10,
        paymentAccountName: 'Checking',
      }),
      done(),
    ],
  },
  {
    text: 'Recorded.',
    toolCalls: [
      call('record_ongoing_bucket', {
        name: 'Investments',
        percentOfExpectedSurplus: 20,
      }),
      done(),
    ],
  },
];

describe('ConverseSetup', () => {
  it('walks a whole setup and ends with a draft that composes', async () => {
    const { converse, conversations } = wire(WHOLE_SETUP);

    const turn = await runThrough(converse, WHOLE_SETUP.length);

    expect(turn.conversationId).toBe('conv-1');
    expect(turn.isComplete).toBe(true);
    expect(turn.nextSection).toBeUndefined();

    const document = composeSetup(await draftOf(conversations, 'conv-1'), NOW);

    expect(document.accounts).toHaveLength(1);
    expect(document.templates).toHaveLength(3);
    expect(document.cards).toHaveLength(1);
    expect(document.buckets).toHaveLength(1);
  });

  it('offers only the tools of the section it is asking about', async () => {
    const { converse, model } = wire(OPENING.slice(0, 2));

    await runThrough(converse, 2);

    expect(model.requests[0]?.tools.map((tool) => tool.name)).toEqual([
      'record_payday_anchor',
    ]);
    expect(model.requests[1]?.tools.map((tool) => tool.name)).toEqual([
      'record_account',
      'finish_section',
    ]);
  });

  /**
   * Strict tool use never omits a required field, so anything a user can
   * plausibly leave unsaid has to be optional — and an optional field the
   * model did not fill in is a question, never a default. A defaulted due day
   * is a bill dated into the wrong cycle, which is what UC-5.4 exists to
   * prevent.
   */
  it('leaves an unstated due day unanswered rather than defaulting it', async () => {
    const { converse, conversations } = wire([
      ...OPENING,
      { text: 'Noted.', toolCalls: [healthPlan()] },
    ]);

    const turn = await runThrough(converse, 4);

    expect(turn.established).toEqual([]);
    expect(turn.message).toContain('Health Plan');
    expect(turn.message).toContain('day of the month');
    expect(turn.nextSection).toBe(SetupSection.FixedBills);
    expect((await draftOf(conversations, 'conv-1')).fixedBills).toEqual([]);
  });

  /**
   * A model that fills an optional field with an explicit `null` rather than
   * omitting the key is common enough — it was observed on a local model
   * behind this port — that reading one as a value would put a day nobody
   * said into the ledger.
   */
  it('reads an explicit null the same way it reads an absent field', async () => {
    const { converse, conversations } = wire([
      ...OPENING,
      { text: 'Noted.', toolCalls: [healthPlan({ dueDayOfMonth: null })] },
    ]);

    const turn = await runThrough(converse, 4);

    expect(turn.established).toEqual([]);
    expect((await draftOf(conversations, 'conv-1')).fixedBills).toEqual([]);
  });

  it('records the bill once the missing day arrives', async () => {
    const { converse, conversations } = wire([
      ...OPENING,
      { text: 'Noted.', toolCalls: [healthPlan()] },
      { text: 'Recorded.', toolCalls: [healthPlan({ dueDayOfMonth: 8 })] },
    ]);

    const turn = await runThrough(converse, 5);

    expect(turn.established).toHaveLength(1);
    expect((await draftOf(conversations, 'conv-1')).fixedBills).toHaveLength(1);
  });

  /**
   * The draft owns every rule, so a record it will not hold comes back as
   * something to say — not as an exception the wizard has to recover from.
   */
  it('turns a rejected record into a correction and keeps going', async () => {
    const { converse, conversations } = wire([
      ...OPENING,
      { text: 'Recorded.', toolCalls: [healthPlan({ dueDayOfMonth: 8 })] },
      {
        text: 'Noted.',
        toolCalls: [healthPlan({ amountInCents: 45_000, dueDayOfMonth: 12 })],
      },
      {
        text: 'Recorded.',
        toolCalls: [
          call('record_fixed_bill', {
            name: 'Internet',
            amountInCents: 12_000,
            dueDayOfMonth: 20,
          }),
        ],
      },
    ]);

    const rejected = await runThrough(converse, 5);

    expect(rejected.established).toEqual([]);
    expect(rejected.corrections[0]).toContain('Health Plan');
    expect(rejected.message).toContain('Health Plan');

    const next = await converse.execute(me, {
      conversationId: rejected.conversationId,
      message: 'internet is 120 on the 20th',
    });

    expect(next.established).toHaveLength(1);
    const draft = await draftOf(conversations, 'conv-1');
    expect(draft.fixedBills.map((bill) => bill.amount.cents)).toEqual([
      -32_000, -12_000,
    ]);
  });

  /**
   * FIN-117 — a bill on the 4th is a real bill. With pay on the 5th, three of
   * the twelve cycles end on the 3rd and never reach it, so the refusal is
   * put to the user as an offer of the cycle's own last day.
   */
  it('offers the cycle last day rather than refusing a bill in a gap', async () => {
    const { converse, conversations } = wire([...OPENING, gymTurn()]);

    const turn = await runThrough(converse, 4);

    expect(turn.corrections[0]).toMatch(
      /Gym.*day 4.*last day.*everywhere else/,
    );
    expect((await draftOf(conversations, 'conv-1')).fixedBills).toEqual([]);
  });

  /** The model has to be told what taking the offer is, or it cannot ask. */
  it('tells the model how the offer is taken, and never takes it itself', async () => {
    const { converse, conversations } = wire([...OPENING, gymTurn()]);

    await runThrough(converse, 4);
    const stored = await conversations.load('conv-1');
    const results = stored?.transcript.flatMap((message) =>
      message.role === 'toolResults' ? message.results : [],
    );

    expect(results?.at(-1)?.content).toContain('acceptCycleLastDay');
    expect(results?.at(-1)?.isError).toBe(true);
  });

  it('records the fallback once the user has taken the offer', async () => {
    const { converse, conversations } = wire([
      ...OPENING,
      gymTurn(),
      gymTurn({ acceptCycleLastDay: true }),
    ]);

    await runThrough(converse, 5);
    const [gym] = (await draftOf(conversations, 'conv-1')).fixedBills;

    expect(gym?.dueDayOfMonth).toBe(4);
    expect(
      gym?.dueDateOverrides.map((override) => override.date.toISO()),
    ).toEqual(['2026-09-03', '2026-12-03', '2027-06-03']);
  });

  it('takes the offer on a correction as well as on a recording', async () => {
    const { converse, conversations } = wire([
      ...OPENING,
      { text: 'Recorded.', toolCalls: [healthPlan({ dueDayOfMonth: 8 })] },
      {
        text: 'Fixed.',
        toolCalls: [
          call('correct_record', {
            recordId: 'conv-3',
            dueDayOfMonth: 4,
            acceptCycleLastDay: true,
          }),
        ],
      },
    ]);

    const turn = await runThrough(converse, 5);
    const [bill] = (await draftOf(conversations, 'conv-1')).fixedBills;

    expect(turn.corrections).toEqual([]);
    expect(bill?.dueDayOfMonth).toBe(4);
    expect(bill?.dueDateOverrides).toHaveLength(3);
  });

  /** Only a confirmed correction may replace an answer, never a stray call. */
  it('declines a tool call for a section that is already answered', async () => {
    const { converse, conversations } = wire([
      ...OPENING,
      {
        text: 'Noted.',
        toolCalls: [call('record_salary', { amountInCents: 100 })],
      },
    ]);

    const turn = await runThrough(converse, 4);

    expect(turn.established).toEqual([]);
    expect(turn.corrections[0]).toContain('already');
    expect((await draftOf(conversations, 'conv-1')).salary?.cents).toBe(
      1_800_000,
    );
  });

  it('surfaces a refusal as something to say, not as a failure', async () => {
    const { converse } = wire([
      { text: 'I cannot help with that.', stopReason: 'refusal' },
    ]);

    const turn = await converse.execute(me, { message: 'do something else' });

    expect(turn.wasRefused).toBe(true);
    expect(turn.message).toBe('I cannot help with that.');
    expect(turn.established).toEqual([]);
  });

  it('settles a section the user has nothing to say about', async () => {
    const { converse, conversations } = wire([
      ...WHOLE_SETUP.slice(0, 5),
      { text: 'No cards, then.', toolCalls: [done()] },
    ]);

    const turn = await runThrough(converse, 6);

    expect(turn.nextSection).toBe(SetupSection.Buckets);
    expect((await draftOf(conversations, 'conv-1')).cards).toEqual([]);
  });

  /**
   * The transcript is held here, so what the model sees on the second turn is
   * what this interactor stored — never what a caller sent back.
   */
  it('holds the transcript server-side and replays it to the model', async () => {
    const { converse, model, conversations } = wire(OPENING.slice(0, 2));

    await runThrough(converse, 2);
    const stored = await conversations.load('conv-1');

    expect(model.requests[1]?.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'toolResults',
      'user',
    ]);
    expect(stored?.transcript).toHaveLength(6);
    expect(stored?.records).toHaveLength(2);
  });

  it('refuses a conversation it is not holding', async () => {
    const { converse } = wire([]);

    await expect(
      converse.execute(me, { conversationId: 'conv-9', message: 'hello' }),
    ).rejects.toBeInstanceOf(SetupConversationNotFound);
  });
  it('asks for the shift policy nobody stated only as the default', async () => {
    const { converse, conversations } = wire([
      {
        text: 'Noted.',
        toolCalls: [
          call('record_payday_anchor', {
            dayOfMonth: 20,
            shiftPolicy: 'FOLLOWING',
          }),
        ],
      },
    ]);

    const turn = await runThrough(converse, 1);

    expect(turn.established[0]?.summary).toContain('following');
    expect((await draftOf(conversations, 'conv-1')).anchor?.shiftPolicy).toBe(
      'FOLLOWING',
    );
  });

  it('asks again when the anchor day did not arrive as a number', async () => {
    const { converse } = wire([
      {
        text: 'Noted.',
        toolCalls: [call('record_payday_anchor', { dayOfMonth: 'the 5th' })],
      },
    ]);

    const turn = await runThrough(converse, 1);

    expect(turn.established).toEqual([]);
    expect(turn.message).toContain('day of the month your salary lands');
  });

  it('asks for the kind of account and what is in it', async () => {
    const { converse } = wire([
      anchorTurn,
      {
        text: 'Noted.',
        toolCalls: [call('record_account', { name: 'Nubank' })],
      },
    ]);

    const turn = await runThrough(converse, 2);

    expect(turn.message).toContain('checking, savings or cash');
    expect(turn.message).toContain('what is in it right now');
    expect(turn.message).toContain('Nubank');
  });

  it('asks again when the salary did not arrive as whole cents', async () => {
    const { converse } = wire([
      ...OPENING.slice(0, 2),
      {
        text: 'Noted.',
        toolCalls: [call('record_salary', { amountInCents: '18000' })],
      },
    ]);

    const turn = await runThrough(converse, 3);

    expect(turn.established).toEqual([]);
    expect(turn.message).toContain('what your salary is');
  });

  it('records a bill the user called a guess as an estimate', async () => {
    const { converse, conversations } = wire([
      ...OPENING,
      {
        text: 'Noted.',
        toolCalls: [healthPlan({ dueDayOfMonth: 8, isEstimate: true })],
      },
    ]);

    const turn = await runThrough(converse, 4);

    expect(turn.established[0]?.summary).toContain('an estimate');
    expect(
      (await draftOf(conversations, 'conv-1')).fixedBills[0]?.isEstimate,
    ).toBe(true);
  });

  it('asks for everything a card needs beyond its name', async () => {
    const { converse } = wire([
      ...TO_CARDS,
      { text: 'Noted.', toolCalls: [call('record_card', { name: 'Inter' })] },
    ]);

    const turn = await runThrough(converse, TO_CARDS.length + 1);

    expect(turn.message).toContain('the credit limit');
    expect(turn.message).toContain('the day the invoice closes');
    expect(turn.message).toContain('the day the invoice falls due');
    expect(turn.message).toContain('which account pays it');
  });

  it('records a goal bucket with its target and the date to reach it', async () => {
    const { converse, conversations } = wire([
      ...TO_BUCKETS,
      {
        text: 'Noted.',
        toolCalls: [
          call('record_goal_bucket', {
            name: 'Apartment',
            fixedAmountInCents: 177_800,
            targetAmountInCents: 15_000_000,
            targetDate: '2031-03-01',
          }),
        ],
      },
    ]);

    const turn = await runThrough(converse, TO_BUCKETS.length + 1);
    const [bucket] = (await draftOf(conversations, 'conv-1')).buckets;

    expect(turn.established[0]?.summary).toContain('R$ 150.000,00');
    expect(bucket?.mode).toBe('GOAL');
    expect(bucket?.priority).toBe(1);
  });

  it('asks a goal bucket for the rule, the target and the date', async () => {
    const { converse } = wire([
      ...TO_BUCKETS,
      {
        text: 'Noted.',
        toolCalls: [
          call('record_goal_bucket', {
            name: 'Apartment',
            targetDate: 'March 2031',
          }),
        ],
      },
    ]);

    const turn = await runThrough(converse, TO_BUCKETS.length + 1);

    expect(turn.message).toContain('a percentage of Expected Surplus');
    expect(turn.message).toContain('the amount to reach');
    expect(turn.message).toContain('the date to reach it by');
  });

  it('asks an ongoing bucket how much goes in each cycle', async () => {
    const { converse } = wire([
      ...TO_BUCKETS,
      {
        text: 'Noted.',
        toolCalls: [
          call('record_ongoing_bucket', {
            name: 'Investments',
            percentOfExpectedSurplus: -5,
          }),
        ],
      },
    ]);

    const turn = await runThrough(converse, TO_BUCKETS.length + 1);

    expect(turn.established).toEqual([]);
    expect(turn.message).toContain('Investments');
  });

  it('gives each further bucket the next free funding order', async () => {
    const bucket = (name: string) =>
      call('record_ongoing_bucket', { name, percentOfExpectedSurplus: 10 });
    const { converse, conversations } = wire([
      ...TO_BUCKETS,
      { text: 'Noted.', toolCalls: [bucket('Investments'), bucket('Reserve')] },
    ]);

    await runThrough(converse, TO_BUCKETS.length + 1);

    expect(
      (await draftOf(conversations, 'conv-1')).buckets.map(
        (saved) => saved.priority,
      ),
    ).toEqual([1, 2]);
  });

  /** A rule asking for nothing is the draft's rule, not this file's. */
  it('passes a rule that asks for nothing to the draft to refuse', async () => {
    const { converse } = wire([
      ...TO_BUCKETS,
      {
        text: 'Noted.',
        toolCalls: [
          call('record_ongoing_bucket', {
            name: 'Investments',
            percentOfExpectedSurplus: 0,
          }),
        ],
      },
    ]);

    const turn = await runThrough(converse, TO_BUCKETS.length + 1);

    expect(turn.corrections[0]).toContain('allocation rule');
  });

  it('declines a tool it never offered', async () => {
    const { converse } = wire([
      { text: 'Noted.', toolCalls: [call('record_everything', {})] },
    ]);

    const turn = await runThrough(converse, 1);

    expect(turn.message).toContain('record_everything');
  });

  it('refuses to skip the payday anchor', async () => {
    const { converse } = wire([{ text: 'Skipping.', toolCalls: [done()] }]);

    const turn = await runThrough(converse, 1);

    expect(turn.message).toContain('cannot be skipped');
    expect(turn.nextSection).toBe(SetupSection.Anchor);
  });

  it('has nothing left to record once every section is settled', async () => {
    const { converse, model } = wire([
      ...WHOLE_SETUP,
      { text: '', toolCalls: [healthPlan({ dueDayOfMonth: 8 })] },
    ]);

    const complete = await runThrough(converse, WHOLE_SETUP.length);
    const turn = await converse.execute(me, {
      conversationId: complete.conversationId,
      message: 'one more bill',
    });

    expect(turn.corrections[0]).toContain('already recorded');
    // Nothing left to record, but everything recorded is still correctable.
    expect(
      model.requests[WHOLE_SETUP.length]?.tools.map((tool) => tool.name),
    ).toEqual(['correct_record', 'remove_record']);
  });

  /**
   * UC-1.5 — a record is shown back so it can be corrected, and extraction is
   * a model reading prose: it will get an amount or a day wrong. The id comes
   * from the id source, so a sequential one makes it predictable here.
   */
  it('corrects a record the user says is wrong, in place', async () => {
    const { converse, conversations } = wire([
      ...OPENING,
      { text: 'Recorded.', toolCalls: [healthPlan({ dueDayOfMonth: 8 })] },
      {
        text: 'Fixed.',
        toolCalls: [
          call('correct_record', {
            recordId: 'conv-3',
            amountInCents: 35_000,
          }),
        ],
      },
    ]);

    const turn = await runThrough(converse, 5);
    const draft = await draftOf(conversations, 'conv-1');

    expect(turn.established[0]?.id).toBe('conv-3');
    expect(turn.corrections).toEqual([]);
    expect(draft.fixedBills).toHaveLength(1);
    expect(draft.fixedBills[0]?.amount.cents).toBe(-35_000);
    expect(draft.fixedBills[0]?.dueDayOfMonth).toBe(8);
  });

  /** Correcting one record does not restart the conversation — UC-1.5. */
  it('corrects a record of a settled section without going back to it', async () => {
    const { converse, conversations } = wire([
      ...OPENING,
      {
        text: 'Recorded.',
        toolCalls: [healthPlan({ dueDayOfMonth: 8 }), done()],
      },
      {
        text: 'Fixed.',
        toolCalls: [
          call('correct_record', { recordId: 'conv-3', name: 'Health' }),
        ],
      },
    ]);

    const turn = await runThrough(converse, 5);

    expect(turn.nextSection).toBe(SetupSection.VariableBills);
    expect(turn.established[0]?.section).toBe(SetupSection.FixedBills);
    expect((await draftOf(conversations, 'conv-1')).fixedBills[0]?.name).toBe(
      'Health',
    );
  });

  /**
   * The correction runs the placement rule again rather than trusting the
   * record it replaces — FIN-93 and FIN-117 are both that rule.
   */
  it('refuses a correction the draft will not hold and keeps the record', async () => {
    const { converse, conversations } = wire([
      {
        text: 'Noted.',
        toolCalls: [call('record_payday_anchor', { dayOfMonth: 31 })],
      },
      accountTurn,
      salaryTurn,
      {
        text: 'Recorded.',
        toolCalls: [
          call('record_fixed_bill', {
            name: 'Rent',
            amountInCents: 250_000,
            dueDayOfMonth: 31,
          }),
        ],
      },
      {
        text: 'Fixed.',
        toolCalls: [
          call('correct_record', { recordId: 'conv-3', dueDayOfMonth: 30 }),
        ],
      },
    ]);

    const turn = await runThrough(converse, 5);
    const [bill] = (await draftOf(conversations, 'conv-1')).fixedBills;

    expect(turn.established).toEqual([]);
    expect(turn.corrections[0]).toContain('Rent');
    expect(bill?.dueDayOfMonth).toBe(31);
  });

  it('drops a record the user says should not be there at all', async () => {
    const { converse, conversations } = wire([
      ...OPENING,
      {
        text: 'Recorded.',
        toolCalls: [healthPlan({ dueDayOfMonth: 8 })],
      },
      {
        text: 'Dropped.',
        toolCalls: [call('remove_record', { recordId: 'conv-3' })],
      },
    ]);

    const turn = await runThrough(converse, 5);
    const stored = await conversations.load('conv-1');

    expect(turn.removed).toEqual(['conv-3']);
    expect(turn.nextSection).toBe(SetupSection.FixedBills);
    expect((await draftOf(conversations, 'conv-1')).fixedBills).toEqual([]);
    expect(stored?.records.map((record) => record.id)).not.toContain('conv-3');
  });

  /**
   * Dropping the last record of a section the conversation has already passed
   * leaves nothing there — and a draft that cannot compose has to be asked
   * about again rather than reported as finished.
   */
  it('asks again about a section left empty by a removal', async () => {
    const { converse } = wire([
      ...WHOLE_SETUP,
      {
        text: 'Dropped.',
        toolCalls: [call('remove_record', { recordId: 'conv-4' })],
      },
    ]);

    const complete = await runThrough(converse, WHOLE_SETUP.length);
    expect(complete.isComplete).toBe(true);

    const turn = await converse.execute(me, {
      conversationId: complete.conversationId,
      message: 'electricity is on the card, drop it',
    });

    expect(turn.removed).toEqual(['conv-4']);
    expect(turn.isComplete).toBe(false);
    expect(turn.nextSection).toBe(SetupSection.VariableBills);
  });

  it('refuses a correction naming an id it never recorded', async () => {
    const { converse } = wire([
      ...OPENING,
      {
        text: 'Fixed.',
        toolCalls: [call('correct_record', { recordId: 'conv-9', name: 'X' })],
      },
    ]);

    const turn = await runThrough(converse, 4);

    expect(turn.established).toEqual([]);
    expect(turn.message).toContain('conv-9');
  });

  /**
   * Every kind of record `WHOLE_SETUP` establishes, and the id the sequential
   * id source gave it: the account, the fixed bill, the card and the bucket.
   */
  const corrected: readonly [string, string, JsonObject][] = [
    ['an account', 'conv-2', { balanceInCents: 500_000 }],
    ['a fixed bill', 'conv-3', { amountInCents: 35_000 }],
    ['a variable bill', 'conv-4', { dueDayOfMonth: 16 }],
    ['a card', 'conv-5', { closingDay: 25, limitInCents: 2_000_000 }],
    ['a bucket', 'conv-6', { fixedAmountInCents: 177_800 }],
  ];

  it.each(corrected)(
    'corrects %s once everything has been recorded',
    async (_name, recordId, args) => {
      const { converse } = wire([
        ...WHOLE_SETUP,
        {
          text: 'Fixed.',
          toolCalls: [call('correct_record', { recordId, ...args })],
        },
      ]);

      const turn = await runThrough(converse, WHOLE_SETUP.length + 1);

      expect(turn.corrections).toEqual([]);
      expect(turn.established[0]?.id).toBe(recordId);
      expect(turn.isComplete).toBe(true);
    },
  );

  it('corrects the card and reads back the account that still pays it', async () => {
    const { converse, conversations } = wire([
      ...WHOLE_SETUP,
      {
        text: 'Fixed.',
        toolCalls: [
          call('correct_record', { recordId: 'conv-5', closingDay: 25 }),
        ],
      },
    ]);

    const turn = await runThrough(converse, WHOLE_SETUP.length + 1);
    const [card] = (await draftOf(conversations, 'conv-1')).cards;

    expect(card?.closingDay).toBe(25);
    expect(card?.dueDay).toBe(10);
    expect(turn.established[0]?.summary).toContain('paid from Checking');
  });

  it('corrects what an ongoing bucket puts away, keeping its funding order', async () => {
    const { converse, conversations } = wire([
      ...WHOLE_SETUP,
      {
        text: 'Fixed.',
        toolCalls: [
          call('correct_record', {
            recordId: 'conv-6',
            fixedAmountInCents: 177_800,
          }),
        ],
      },
    ]);

    const turn = await runThrough(converse, WHOLE_SETUP.length + 1);
    const [bucket] = (await draftOf(conversations, 'conv-1')).buckets;

    expect(bucket?.rule).toEqual(Allocation.fixed(Money.fromCents(177_800)));
    expect(bucket?.priority).toBe(1);
    expect(turn.established[0]?.summary).toContain('funded #1');
  });

  const goalSetup: ScriptedTurn[] = [
    ...TO_BUCKETS,
    {
      text: 'Recorded.',
      toolCalls: [
        call('record_goal_bucket', {
          name: 'Apartment',
          fixedAmountInCents: 177_800,
          targetAmountInCents: 15_000_000,
          targetDate: '2031-03-01',
        }),
      ],
    },
  ];

  it('corrects the target a goal is saving toward', async () => {
    const { converse, conversations } = wire([
      ...goalSetup,
      {
        text: 'Fixed.',
        toolCalls: [
          call('correct_record', {
            recordId: 'conv-3',
            targetAmountInCents: 20_000_000,
            targetDate: '2032-03-01',
          }),
        ],
      },
    ]);

    const turn = await runThrough(converse, goalSetup.length + 1);
    const [bucket] = (await draftOf(conversations, 'conv-1')).buckets;

    expect(
      bucket?.mode === 'GOAL' ? bucket.target.amount.cents : undefined,
    ).toBe(20_000_000);
    expect(turn.established[0]?.summary).toContain('2032-03-01');
  });

  it('asks what to change when a correction to a goal names no field', async () => {
    const { converse } = wire([
      ...goalSetup,
      {
        text: 'Fixed.',
        toolCalls: [call('correct_record', { recordId: 'conv-3' })],
      },
    ]);

    const turn = await runThrough(converse, goalSetup.length + 1);

    expect(turn.established).toEqual([]);
    expect(turn.message).toContain('Apartment');
  });

  const nothingStated: readonly [string, string][] = [
    ['an account', 'conv-2'],
    ['a bill', 'conv-3'],
    ['a card', 'conv-5'],
    ['an ongoing bucket', 'conv-6'],
  ];

  it.each(nothingStated)(
    'asks what to change when a correction to %s names no field',
    async (_name, recordId) => {
      const { converse } = wire([
        ...WHOLE_SETUP,
        { text: 'Fixed.', toolCalls: [call('correct_record', { recordId })] },
      ]);

      const turn = await runThrough(converse, WHOLE_SETUP.length + 1);

      expect(turn.established).toEqual([]);
      expect(turn.message).toContain('what to change');
    },
  );

  it('asks which record when neither tool names one', async () => {
    const { converse } = wire([
      ...WHOLE_SETUP,
      {
        text: 'Fixed.',
        toolCalls: [call('correct_record', {}), call('remove_record', {})],
      },
    ]);

    const turn = await runThrough(converse, WHOLE_SETUP.length + 1);

    expect(turn.corrections).toHaveLength(2);
    expect(turn.message).toContain('which record');
  });

  it('refuses to drop a record it never recorded', async () => {
    const { converse } = wire([
      ...WHOLE_SETUP,
      {
        text: 'Dropped.',
        toolCalls: [call('remove_record', { recordId: 'conv-9' })],
      },
    ]);

    const turn = await runThrough(converse, WHOLE_SETUP.length + 1);

    expect(turn.removed).toEqual([]);
    expect(turn.message).toContain('conv-9');
  });

  /** The draft's rule, said back: a card would be left paid from nothing. */
  it('refuses to drop an account a card is paid from', async () => {
    const { converse, conversations } = wire([
      ...WHOLE_SETUP,
      {
        text: 'Dropped.',
        toolCalls: [call('remove_record', { recordId: 'conv-2' })],
      },
    ]);

    const turn = await runThrough(converse, WHOLE_SETUP.length + 1);

    expect(turn.removed).toEqual([]);
    expect(turn.corrections[0]).toContain('Inter');
    expect((await draftOf(conversations, 'conv-1')).accounts).toHaveLength(1);
  });

  it('offers the corrections only once there is something to correct', async () => {
    const { converse, model } = wire(OPENING);

    await runThrough(converse, 3);

    expect(model.requests[0]?.tools.map((tool) => tool.name)).toEqual([
      'record_payday_anchor',
    ]);
    expect(model.requests[2]?.tools.map((tool) => tool.name)).toEqual([
      'record_salary',
      'finish_section',
      'correct_record',
      'remove_record',
    ]);
  });

  /** The wizard always has something to say, even when the model does not. */
  it('falls back to the section question when the model says nothing', async () => {
    const { converse } = wire([{ text: '', toolCalls: [] }]);

    const turn = await converse.execute(me, { message: 'hello' });

    expect(turn.message).toBe('Which day of the month does your salary land?');
  });
});

const ANSWERS = [
  'I am paid on the 5th',
  'Checking, 2160 in it',
  '18k a month',
  'health plan 320 on the 8th',
  'electricity around 280 on the 15th',
  'Inter, 10k limit, closes 28 due 10, paid from Checking',
  '20% of what is left goes to investments',
];

/** Runs `turns` answers through one conversation and hands back the last. */
async function runThrough(converse: ConverseSetup, turns: number) {
  let turn = await converse.execute(me, { message: ANSWERS[0] ?? '' });

  for (let index = 1; index < turns; index += 1) {
    turn = await converse.execute(me, {
      conversationId: turn.conversationId,
      message: ANSWERS[index] ?? 'go on',
    });
  }

  return turn;
}

describe('ConverseSetup — the spend ceiling', () => {
  /**
   * Refusing after the call has been paid for would bound nothing, so the
   * ledger is asked before the request goes out.
   */
  it('refuses a turn past the day’s ceiling without calling the model', async () => {
    const ledger = new FakeSpendLedger();
    await ledger.record(me, today, { inputTokens: 900, outputTokens: 100 });
    const { converse, model } = wire([], { ledger, maxTokensPerDay: 1_000 });

    await expect(
      converse.execute(me, { message: 'I earn 18k' }),
    ).rejects.toBeInstanceOf(SpendCeilingReached);
    expect(model.requests).toHaveLength(0);
  });

  it('records what the turn cost', async () => {
    const { converse, ledger } = wire([
      { ...anchorTurn, usage: { inputTokens: 1_400, outputTokens: 120 } },
    ]);

    await converse.execute(me, { message: 'I am paid on the 5th' });

    expect(await ledger.spentOn(me, today)).toBe(1_520);
  });
});

describe('ConverseSetup — what one conversation may cost', () => {
  const TIGHT: SetupLimits = {
    maxMessageCharacters: 40,
    maxTurnsPerConversation: 3,
  };

  it('rejects a message past the cap instead of trimming it', async () => {
    const { converse, model, conversations } = wire([anchorTurn], {
      limits: TIGHT,
    });

    await expect(
      converse.execute(me, {
        message:
          'health plan 320 on the 8th, electricity around 280 on the 15th',
      }),
    ).rejects.toBeInstanceOf(SetupMessageTooLong);
    expect(model.requests).toHaveLength(0);
    expect(await conversations.load('conv-1')).toBeUndefined();
  });

  it('rejects the turn past the cap rather than dropping earlier ones', async () => {
    const { converse, model } = wire(OPENING, { limits: TIGHT });

    const turn = await runThrough(converse, 3);

    await expect(
      converse.execute(me, {
        conversationId: turn.conversationId,
        message: 'go on',
      }),
    ).rejects.toBeInstanceOf(SetupConversationTooLong);
    expect(model.requests).toHaveLength(3);
  });

  /**
   * The client sends a message and an id and nothing else, so what a
   * conversation has already cost is read where it cannot reach.
   */
  it('counts the turns from the transcript the server holds', async () => {
    const { converse, conversations, model } = wire([anchorTurn], {
      limits: TIGHT,
    });
    await conversations.save({
      id: 'held',
      transcript: [
        { role: 'user', text: 'First' },
        { role: 'assistant', text: 'One.', toolCalls: [] },
        { role: 'user', text: 'Second' },
        { role: 'assistant', text: 'Two.', toolCalls: [] },
        { role: 'user', text: 'Third' },
        { role: 'assistant', text: 'Three.', toolCalls: [] },
      ],
      state: {
        draft: SetupDraft.empty(
          '2026-09',
          noHolidays,
          new SequentialIdSource('rec'),
        ),
        section: SetupSection.Anchor,
      },
      records: [],
    });

    await expect(
      converse.execute(me, { conversationId: 'held', message: 'Fourth' }),
    ).rejects.toBeInstanceOf(SetupConversationTooLong);
    expect(model.requests).toHaveLength(0);
  });

  /**
   * A correction writes the user's own line into the transcript without
   * reaching a model, so counting user lines would have the free path spend
   * the budget of the paid one.
   */
  it('spends no turn on the corrections written into the transcript', async () => {
    const { converse, conversations } = wire([anchorTurn], { limits: TIGHT });
    await conversations.save({
      id: 'held',
      transcript: [
        { role: 'user', text: 'Corrected. Health Plan — R$ 350,00 on day 8.' },
        { role: 'user', text: 'Dropped Gym.' },
        { role: 'user', text: 'Corrected. Checking — R$ 2.160,00.' },
      ],
      state: {
        draft: SetupDraft.empty(
          '2026-09',
          noHolidays,
          new SequentialIdSource('rec'),
        ),
        section: SetupSection.Anchor,
      },
      records: [],
    });

    const turn = await converse.execute(me, {
      conversationId: 'held',
      message: 'I am paid on the 5th',
    });

    expect(turn.conversationId).toBe('held');
  });
});
