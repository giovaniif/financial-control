import type {
  SetupAppliedResponse,
  SetupDueDayRefusalResponse,
  SetupStateResponse,
  SetupTurnResponse,
} from '@fin/contracts';
import { describe, expect, it } from 'vitest';

import { ReadSetupState } from '../../../application/projection/uc-1-5-read-setup-state.js';
import { CompleteSetup } from '../../../application/setup/compose-setup.js';
import { establishedOf } from '../../../application/setup/established-record.js';
import { CorrectSetupRecord } from '../../../application/setup/uc-1-5-correct-record.js';
import { SpendCeiling } from '../../../application/spend/spend-ceiling.js';
import { SetupDraft } from '../../../application/setup/setup-draft.js';
import type {
  SetupConversations,
  SetupLimits,
  SetupState,
} from '../../../application/setup/uc-1-5-converse-setup.js';
import { ConverseSetup } from '../../../application/setup/uc-1-5-converse-setup.js';
import { BackupRestore } from '../../../application/backup/uc-1-6-backup-restore.js';
import type { ScriptedTurn } from '../../../application/testing/fake-language-model.js';
import { FakeLanguageModel } from '../../../application/testing/fake-language-model.js';
import {
  FakeSetupConversationStore,
  FakeSpendLedger,
  InMemoryAccountRepository,
  InMemoryBucketRepository,
  InMemoryCardRepository,
  InMemoryCycleRepository,
  InMemorySettingsRepository,
  InMemoryTemplateRepository,
  SequentialIdSource,
} from '../../../application/testing/fakes.js';
import { FixedClock } from '../../../application/testing/fixed-clock.js';
import { Account } from '../../../domain/budgeting/account.js';
import { Allocation } from '../../../domain/goals/bucket.js';
import {
  PaydayAnchor,
  ShiftPolicy,
} from '../../../domain/budgeting/cycle-ref.js';
import { noHolidays } from '../../../domain/ports/holiday-calendar.js';
import { LanguageModelFailed } from '../../../domain/ports/language-model.js';
import { Money } from '../../../domain/shared/money.js';
import { Percentage } from '../../../domain/shared/percentage.js';
import { Principal } from '../../../domain/shared/principal.js';
import { LocalDate } from '../../../domain/shared/local-date.js';
import { buildTestServer } from '../testing/test-server.js';

const NOW = '2026-08-10T12:00:00Z';

function readSetupState(accounts: InMemoryAccountRepository): ReadSetupState {
  return new ReadSetupState(
    new InMemorySettingsRepository(),
    accounts,
    new InMemoryTemplateRepository(),
    new InMemoryCardRepository(),
    new InMemoryBucketRepository(),
  );
}

/**
 * A server whose setup routes share one conversation store, so a turn and the
 * apply that follows it are talking about the same conversation.
 */
/** Far above anything this suite spends, unless a test says otherwise. */
const NO_CEILING = 1_000_000;

/** Far above anything this suite sends, unless the test is about the caps. */
const NO_LIMITS: SetupLimits = {
  maxMessageCharacters: 10_000,
  maxTurnsPerConversation: 1_000,
};

function wire(
  model: FakeLanguageModel,
  budget: { maxTokensPerDay?: number; limits?: SetupLimits } = {},
) {
  const clock = FixedClock.at(NOW);
  const conversations: SetupConversations = new FakeSetupConversationStore();
  const ledger = new FakeSpendLedger();
  const spend = new SpendCeiling(
    ledger,
    clock,
    budget.maxTokensPerDay ?? NO_CEILING,
  );
  const backup = new BackupRestore(
    new InMemoryCycleRepository(),
    new InMemoryAccountRepository(),
    new InMemoryTemplateRepository(),
    new InMemoryCardRepository(),
    new InMemoryBucketRepository(),
    new InMemorySettingsRepository(),
    noHolidays,
    clock,
  );

  return {
    conversations,
    ledger,
    app: buildTestServer({
      converseSetup: new ConverseSetup(
        model,
        conversations,
        spend,
        new SequentialIdSource('conv'),
        noHolidays,
        clock,
        budget.limits ?? NO_LIMITS,
      ),
      correctSetupRecord: new CorrectSetupRecord(conversations),
      completeSetup: new CompleteSetup(conversations, backup, clock),
    }),
  };
}

/** A conversation as far as bills, holding the ids a correction names. */
function establishedState(): SetupState {
  const draft = SetupDraft.empty(
    '2026-09',
    noHolidays,
    new SequentialIdSource('rec'),
  )
    .withAnchor(PaydayAnchor.of(5, ShiftPolicy.Preceding))
    .addAccount({
      name: 'Checking',
      type: 'CHECKING',
      balance: Money.fromCents(216_000),
    })
    .withSalary(Money.fromCents(1_800_000))
    .addFixedBill({
      name: 'Health Plan',
      amount: Money.fromCents(32_000),
      dueDayOfMonth: 8,
    });

  return { draft, section: 'FIXED_BILLS' };
}

async function holding(
  conversations: SetupConversations,
  state: SetupState = establishedState(),
): Promise<void> {
  await conversations.save({
    id: 'conv-1',
    transcript: [],
    state,
    records: state.draft.records.map(establishedOf),
  });
}

const BILL_ID = 'rec-2';

const anchorTurn: ScriptedTurn = {
  text: 'Noted.',
  toolCalls: [
    {
      id: 'call-1',
      name: 'record_payday_anchor',
      arguments: { dayOfMonth: 5 },
    },
  ],
};

/** A conversation with every section answered or skipped, ready to apply. */
function completedState(): SetupState {
  const draft = SetupDraft.empty(
    '2026-09',
    noHolidays,
    new SequentialIdSource('rec'),
  )
    .withAnchor(PaydayAnchor.of(5, ShiftPolicy.Preceding))
    .addAccount({
      name: 'Checking',
      type: 'CHECKING',
      balance: Money.fromCents(216_000),
    })
    .withSalary(Money.fromCents(1_800_000))
    .skip('FIXED_BILLS')
    .skip('VARIABLE_BILLS')
    .skip('CARDS')
    .skip('BUCKETS');

  return { draft, section: undefined };
}

describe('GET /setup', () => {
  it('reports an untouched app as pristine', async () => {
    const app = buildTestServer();

    const response = await app.inject({ method: 'GET', url: '/setup' });

    expect(response.statusCode).toBe(200);
    expect(response.json<SetupStateResponse>()).toEqual({
      anchorConfigured: false,
      accounts: 0,
      cards: 0,
      templates: 0,
      buckets: 0,
      isPristine: true,
      assistantAvailable: true,
    });
  });

  it('reports an app that already holds data as not pristine', async () => {
    const accounts = new InMemoryAccountRepository([
      Account.open({
        id: 'acc-1',
        name: 'Checking',
        type: 'CHECKING',
        balance: Money.fromCents(216_000),
      }),
    ]);
    const app = buildTestServer({ readSetupState: readSetupState(accounts) });

    const response = await app.inject({ method: 'GET', url: '/setup' });

    expect(response.json<SetupStateResponse>()).toMatchObject({
      accounts: 1,
      isPristine: false,
    });
  });

  /**
   * The client picks the plain-form fallback from this flag before the user
   * types, so it has to answer the same thing the conversation route would.
   */
  it('reports the assistant as unavailable when no model is configured', async () => {
    const { app } = wire(FakeLanguageModel.unavailable());

    const response = await app.inject({ method: 'GET', url: '/setup' });

    expect(response.json<SetupStateResponse>().assistantAvailable).toBe(false);
  });
});

describe('POST /setup/conversation', () => {
  it('answers a first turn with the conversation it opened', async () => {
    const { app } = wire(new FakeLanguageModel([anchorTurn]));

    const response = await app.inject({
      method: 'POST',
      url: '/setup/conversation',
      payload: { message: 'I am paid on the 5th.' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<SetupTurnResponse>()).toEqual({
      conversationId: 'conv-1',
      message: 'Noted.',
      established: [
        {
          section: 'ANCHOR',
          id: null,
          summary: expect.stringContaining('Paid on day 5') as string,
          fields: null,
        },
      ],
      removed: [],
      corrections: [],
      nextSection: 'ACCOUNTS',
      isComplete: false,
      wasRefused: false,
    });
  });

  it('continues the conversation the id names', async () => {
    const { app } = wire(
      new FakeLanguageModel([anchorTurn, { text: 'Which accounts?' }]),
    );

    const first = await app.inject({
      method: 'POST',
      url: '/setup/conversation',
      payload: { message: 'I am paid on the 5th.' },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/setup/conversation',
      payload: {
        conversationId: first.json<SetupTurnResponse>().conversationId,
        message: 'What next?',
      },
    });

    expect(second.statusCode).toBe(200);
    expect(second.json<SetupTurnResponse>().conversationId).toBe('conv-1');
    expect(second.json<SetupTurnResponse>().message).toBe('Which accounts?');
  });

  it('rejects a body with no message', async () => {
    const { app } = wire(new FakeLanguageModel([]));

    const response = await app.inject({
      method: 'POST',
      url: '/setup/conversation',
      payload: { conversationId: 'conv-1' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toContain('message');
  });

  it('answers an unknown conversation id with 404', async () => {
    const { app } = wire(new FakeLanguageModel([]));

    const response = await app.inject({
      method: 'POST',
      url: '/setup/conversation',
      payload: { conversationId: 'nope', message: 'hello' },
    });

    expect(response.statusCode).toBe(404);
  });

  /** 503 — the assistant is switched off, which GET /setup already said. */
  it('answers 503 when no model is configured', async () => {
    const { app } = wire(FakeLanguageModel.unavailable());

    const response = await app.inject({
      method: 'POST',
      url: '/setup/conversation',
      payload: { message: 'hello' },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json<{ error: string }>().error).toContain(
      'ANTHROPIC_API_KEY',
    );
  });

  /** 502 — a model that is configured but could not be reached. */
  it('answers 502 when the model call fails', async () => {
    const { app } = wire(
      new FakeLanguageModel([
        { fails: new LanguageModelFailed('The model is overloaded.') },
      ]),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/setup/conversation',
      payload: { message: 'hello' },
    });

    expect(response.statusCode).toBe(502);
  });
});

describe('POST /setup/conversation/:id/apply', () => {
  it('applies a finished conversation and reports what it created', async () => {
    const { app, conversations } = wire(new FakeLanguageModel([]));
    await conversations.save({
      id: 'conv-1',
      transcript: [],
      state: completedState(),
      records: [],
    });

    const response = await app.inject({
      method: 'POST',
      url: '/setup/conversation/conv-1/apply',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<SetupAppliedResponse>()).toEqual({
      anchorDay: 5,
      shiftPolicy: 'PRECEDING',
      accounts: 1,
      templates: 1,
      cards: 0,
      buckets: 0,
    });
  });

  it('answers an unknown conversation id with 404', async () => {
    const { app } = wire(new FakeLanguageModel([]));

    const response = await app.inject({
      method: 'POST',
      url: '/setup/conversation/nope/apply',
    });

    expect(response.statusCode).toBe(404);
  });

  it('refuses to apply a conversation that is still unanswered', async () => {
    const { app, conversations } = wire(new FakeLanguageModel([]));
    await conversations.save({
      id: 'conv-1',
      transcript: [],
      state: {
        draft: SetupDraft.empty(
          '2026-09',
          noHolidays,
          new SequentialIdSource('rec'),
        ),
        section: 'ANCHOR',
      },
      records: [],
    });

    const response = await app.inject({
      method: 'POST',
      url: '/setup/conversation/conv-1/apply',
    });

    expect(response.statusCode).toBe(409);
    expect(response.json<{ error: string }>().error).toContain('ANCHOR');
  });
});

/**
 * The structured path — UC-1.5, FIN-122. Every test here holds a model that
 * would throw if it were asked anything, and the point of the suite is that
 * none of them ever is.
 */
describe('PATCH /setup/conversation/:id/records/:recordId', () => {
  it('corrects a record without asking the model anything', async () => {
    const model = new FakeLanguageModel([]);
    const { app, conversations } = wire(model);
    await holding(conversations);

    const response = await app.inject({
      method: 'PATCH',
      url: `/setup/conversation/conv-1/records/${BILL_ID}`,
      payload: { amount: 35_000 },
    });

    expect(response.statusCode).toBe(200);
    expect(model.requests).toEqual([]);
    expect(response.json<SetupTurnResponse>()).toEqual({
      conversationId: 'conv-1',
      message: expect.stringContaining('350,00') as string,
      established: [
        {
          section: 'FIXED_BILLS',
          id: BILL_ID,
          summary: expect.stringContaining('350,00') as string,
          fields: {
            name: 'Health Plan',
            amount: -35_000,
            dueDayOfMonth: 8,
            isEstimate: false,
          },
        },
      ],
      removed: [],
      corrections: [],
      nextSection: 'FIXED_BILLS',
      isComplete: false,
      wasRefused: false,
    });
  });

  it('answers an unknown conversation id with 404', async () => {
    const { app } = wire(new FakeLanguageModel([]));

    const response = await app.inject({
      method: 'PATCH',
      url: `/setup/conversation/nope/records/${BILL_ID}`,
      payload: { amount: 35_000 },
    });

    expect(response.statusCode).toBe(404);
  });

  it('answers an unknown record id with 404', async () => {
    const { app, conversations } = wire(new FakeLanguageModel([]));
    await holding(conversations);

    const response = await app.inject({
      method: 'PATCH',
      url: '/setup/conversation/conv-1/records/rec-99',
      payload: { amount: 35_000 },
    });

    expect(response.statusCode).toBe(404);
  });

  /** The same rule the conversational path refuses, at the same status. */
  it('answers a refused correction with 400 naming the rule', async () => {
    const { app, conversations } = wire(new FakeLanguageModel([]));
    const draft = SetupDraft.empty(
      '2026-09',
      noHolidays,
      new SequentialIdSource('rec'),
    )
      .withAnchor(PaydayAnchor.of(31, ShiftPolicy.Preceding))
      .addFixedBill({
        name: 'Rent',
        amount: Money.fromCents(250_000),
        dueDayOfMonth: 31,
      });
    await holding(conversations, { draft, section: 'FIXED_BILLS' });

    const response = await app.inject({
      method: 'PATCH',
      url: '/setup/conversation/conv-1/records/rec-1',
      payload: { dueDayOfMonth: 30 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toContain('never reach');
  });

  /**
   * FIN-117 — the refusal carries the cycles it cannot place the day in and
   * the day each offers instead, so the form can make the offer rather than
   * leave the user inventing a different day.
   */
  it('answers a due day in a gap with the cycles and what they offer', async () => {
    const { app, conversations } = wire(new FakeLanguageModel([]));
    await holding(conversations);

    const response = await app.inject({
      method: 'PATCH',
      url: `/setup/conversation/conv-1/records/${BILL_ID}`,
      payload: { dueDayOfMonth: 4 },
    });

    expect(response.statusCode).toBe(400);
    const refusal = response.json<SetupDueDayRefusalResponse>();
    expect(refusal.dueDayOfMonth).toBe(4);
    expect(refusal.cycles).toEqual([
      {
        month: '2026-09',
        label: 'September 2026',
        range: '2026-08-05 – 2026-09-03',
        fallbackDate: '2026-09-03',
        fallbackDayOfMonth: 3,
      },
      {
        month: '2026-12',
        label: 'December 2026',
        range: '2026-11-05 – 2026-12-03',
        fallbackDate: '2026-12-03',
        fallbackDayOfMonth: 3,
      },
      {
        month: '2027-06',
        label: 'June 2027',
        range: '2027-05-05 – 2027-06-03',
        fallbackDate: '2027-06-03',
        fallbackDayOfMonth: 3,
      },
    ]);
  });

  it('takes the offer when the correction says it was accepted', async () => {
    const { app, conversations } = wire(new FakeLanguageModel([]));
    await holding(conversations);

    const response = await app.inject({
      method: 'PATCH',
      url: `/setup/conversation/conv-1/records/${BILL_ID}`,
      payload: { dueDayOfMonth: 4, acceptCycleFallback: true },
    });

    expect(response.statusCode).toBe(200);
    const stored = await conversations.load('conv-1');
    const [bill] = stored?.state.draft.fixedBills ?? [];
    expect(bill?.dueDayOfMonth).toBe(4);
    expect(bill?.dueDateOverrides).toHaveLength(3);
  });

  it('answers a correction stating nothing that applies with 400', async () => {
    const { app, conversations } = wire(new FakeLanguageModel([]));
    await holding(conversations);

    const response = await app.inject({
      method: 'PATCH',
      url: `/setup/conversation/conv-1/records/${BILL_ID}`,
      payload: { closingDay: 25 },
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects a field of the wrong type rather than reading past it', async () => {
    const { app, conversations } = wire(new FakeLanguageModel([]));
    await holding(conversations);

    const response = await app.inject({
      method: 'PATCH',
      url: `/setup/conversation/conv-1/records/${BILL_ID}`,
      payload: { amount: '35000' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('reads a bucket rule as a percentage of Expected Surplus', async () => {
    const { app, conversations } = wire(new FakeLanguageModel([]));
    const draft = establishedState().draft.addOngoingBucket({
      name: 'Investments',
      rule: Allocation.fixed(Money.fromCents(100_000)),
      priority: 1,
    });
    await holding(conversations, { draft, section: 'BUCKETS' });

    const response = await app.inject({
      method: 'PATCH',
      url: '/setup/conversation/conv-1/records/rec-3',
      payload: { rule: { kind: 'PERCENT', percent: 20 } },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<SetupTurnResponse>().message).toContain(
      'Expected Surplus',
    );
  });
});

describe('DELETE /setup/conversation/:id/records/:recordId', () => {
  it('drops a record without asking the model anything', async () => {
    const model = new FakeLanguageModel([]);
    const { app, conversations } = wire(model);
    await holding(conversations);

    const response = await app.inject({
      method: 'DELETE',
      url: `/setup/conversation/conv-1/records/${BILL_ID}`,
    });

    expect(response.statusCode).toBe(200);
    expect(model.requests).toEqual([]);
    expect(response.json<SetupTurnResponse>()).toMatchObject({
      conversationId: 'conv-1',
      removed: [BILL_ID],
      established: [],
    });
  });

  it('answers an unknown record id with 404', async () => {
    const { app, conversations } = wire(new FakeLanguageModel([]));
    await holding(conversations);

    const response = await app.inject({
      method: 'DELETE',
      url: '/setup/conversation/conv-1/records/rec-99',
    });

    expect(response.statusCode).toBe(404);
  });

  /** The card that is paid from it has to go or be corrected first. */
  it('answers a removal the draft refuses with 400', async () => {
    const { app, conversations } = wire(new FakeLanguageModel([]));
    const draft = establishedState().draft.addCard({
      name: 'Inter',
      limit: Money.fromCents(1_000_000),
      closingDay: 28,
      dueDay: 10,
      paymentAccountName: 'Checking',
    });
    await holding(conversations, { draft, section: 'CARDS' });

    const response = await app.inject({
      method: 'DELETE',
      url: '/setup/conversation/conv-1/records/rec-1',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toContain('Inter');
  });
});

describe('POST /setup/conversation — the spend ceiling', () => {
  /**
   * 503 is what the missing key already answers with: nothing is wrong, the
   * assistant is switched off, and the client falls back to the plain form.
   */
  it('answers 503 past the day’s ceiling, without calling the model', async () => {
    const model = new FakeLanguageModel([{ text: 'never asked for' }]);
    const { app, ledger } = wire(model, { maxTokensPerDay: 1_000 });
    await ledger.record(Principal.sole(), LocalDate.parse('2026-08-10'), {
      inputTokens: 1_000,
      outputTokens: 0,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/setup/conversation',
      payload: { message: 'I am paid on the 5th' },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json<{ error: string }>().error).toContain(
      'switched off until tomorrow',
    );
    expect(model.requests).toHaveLength(0);
  });
});

describe('POST /setup/conversation — what one conversation may cost', () => {
  const TIGHT: SetupLimits = {
    maxMessageCharacters: 40,
    maxTurnsPerConversation: 1,
  };

  /** The same status a question past the assistant's cap answers with. */
  it('answers 400 to a message past the cap, without calling the model', async () => {
    const model = new FakeLanguageModel([{ text: 'never asked for' }]);
    const { app } = wire(model, { limits: TIGHT });

    const response = await app.inject({
      method: 'POST',
      url: '/setup/conversation',
      payload: {
        message:
          'health plan 320 on the 8th, electricity around 280 on the 15th',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(model.requests).toHaveLength(0);
  });

  it('answers 409 to a turn past the cap', async () => {
    const model = new FakeLanguageModel([{ text: 'never asked for' }]);
    const { app, conversations } = wire(model, { limits: TIGHT });
    await holding(conversations);
    await spent(conversations);

    const response = await app.inject({
      method: 'POST',
      url: '/setup/conversation',
      payload: { conversationId: 'conv-1', message: 'and the gym, 120' },
    });

    expect(response.statusCode).toBe(409);
    expect(model.requests).toHaveLength(0);
  });

  /** Correcting a record reaches no model, so no cap applies to it. */
  it('leaves the correction routes uncapped at the turn cap', async () => {
    const { app, conversations } = wire(new FakeLanguageModel([]), {
      limits: TIGHT,
    });
    await holding(conversations);
    await spent(conversations);

    const corrected = await app.inject({
      method: 'PATCH',
      url: `/setup/conversation/conv-1/records/${BILL_ID}`,
      payload: { amount: 35_000 },
    });
    const removed = await app.inject({
      method: 'DELETE',
      url: `/setup/conversation/conv-1/records/${BILL_ID}`,
    });

    expect(corrected.statusCode).toBe(200);
    expect(removed.statusCode).toBe(200);
  });
});

/**
 * FIN-124 — a record crosses as data and as prose, and the two are the same
 * record read twice. Asserting both halves per section is what stops a
 * reworded sentence quietly changing what the client is handed.
 */
describe('what an established record carries across the wire', () => {
  /** A draft holding one record of every section that has one. */
  function everySection(): SetupState {
    const draft = SetupDraft.empty(
      '2026-09',
      noHolidays,
      new SequentialIdSource('rec'),
    )
      .withAnchor(PaydayAnchor.of(5, ShiftPolicy.Preceding))
      .addAccount({
        name: 'Checking',
        type: 'CHECKING',
        balance: Money.fromCents(216_000),
      })
      .withSalary(Money.fromCents(1_800_000))
      .addFixedBill({
        name: 'Health Plan',
        amount: Money.fromCents(32_000),
        dueDayOfMonth: 8,
      })
      .addVariableBill({
        name: 'Electricity',
        amount: Money.fromCents(28_000),
        dueDayOfMonth: 15,
      })
      .addCard({
        name: 'Inter',
        limit: Money.fromCents(1_000_000),
        closingDay: 28,
        dueDay: 10,
        paymentAccountName: 'Checking',
      })
      .addOngoingBucket({
        name: 'Investments',
        rule: Allocation.percentOfExpectedSurplus(Percentage.ofPercent(20)),
        priority: 1,
      })
      .addGoalBucket({
        name: 'Apartment',
        rule: Allocation.fixed(Money.fromCents(177_800)),
        priority: 2,
        target: {
          amount: Money.fromCents(15_000_000),
          date: LocalDate.parse('2031-03-05'),
        },
      });

    return { draft, section: 'BUCKETS' };
  }

  it.each([
    [
      'an account',
      'rec-1',
      'Checking — a checking account holding R$ 2.160,00.',
      { name: 'Checking', type: 'CHECKING', balance: 216_000 },
    ],
    [
      'a fixed bill',
      'rec-2',
      'Health Plan — R$ 320,00 on day 8.',
      {
        name: 'Health Plan',
        amount: -32_000,
        dueDayOfMonth: 8,
        isEstimate: false,
      },
    ],
    [
      'a variable bill',
      'rec-3',
      'Electricity — R$ 280,00 on day 15, an estimate.',
      {
        name: 'Electricity',
        amount: -28_000,
        dueDayOfMonth: 15,
        isEstimate: true,
      },
    ],
    [
      'a card',
      'rec-4',
      'Inter — limit R$ 10.000,00, closing on day 28, due on day 10, paid from Checking.',
      {
        name: 'Inter',
        limit: 1_000_000,
        closingDay: 28,
        dueDay: 10,
        paymentAccountName: 'Checking',
      },
    ],
    [
      'an ongoing bucket',
      'rec-5',
      'Investments — 20 % of Expected Surplus each cycle, funded #1.',
      {
        mode: 'ONGOING',
        name: 'Investments',
        rule: { kind: 'PERCENT', percent: 20 },
        priority: 1,
      },
    ],
    [
      'a goal bucket',
      'rec-6',
      'Apartment — R$ 1.778,00 each cycle toward R$ 150.000,00 by 2031-03-05, funded #2.',
      {
        mode: 'GOAL',
        name: 'Apartment',
        rule: { kind: 'FIXED', amount: 177_800 },
        priority: 2,
        target: 15_000_000,
        targetDate: '2031-03-05',
      },
    ],
  ])(
    'states the same thing in its fields as in its sentence — %s',
    async (_what, recordId, summary, fields) => {
      const { app, conversations } = wire(new FakeLanguageModel([]));
      await holding(conversations, everySection());

      // A correction naming the record's own name changes nothing, so what
      // comes back is the record exactly as the draft already holds it.
      const response = await app.inject({
        method: 'PATCH',
        url: `/setup/conversation/conv-1/records/${recordId}`,
        payload: { name: fields.name },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<SetupTurnResponse>().established).toEqual([
        {
          section: expect.any(String) as string,
          id: recordId,
          summary,
          fields,
        },
      ]);
    },
  );

  it('carries no fields for a section holding a single value', async () => {
    const { app } = wire(new FakeLanguageModel([anchorTurn]));

    const response = await app.inject({
      method: 'POST',
      url: '/setup/conversation',
      payload: { message: 'I am paid on the 5th.' },
    });

    expect(response.json<SetupTurnResponse>().established).toEqual([
      {
        section: 'ANCHOR',
        id: null,
        summary: expect.stringContaining('Paid on day 5') as string,
        fields: null,
      },
    ]);
  });
});

/** Puts the held conversation at the turn cap, as a model turn would. */
async function spent(conversations: SetupConversations): Promise<void> {
  const stored = await conversations.load('conv-1');
  if (stored === undefined) throw new Error('Nothing is held as conv-1.');

  await conversations.save({
    ...stored,
    transcript: [
      { role: 'user', text: 'I am paid on the 5th' },
      { role: 'assistant', text: 'Noted.', toolCalls: [] },
    ],
  });
}
