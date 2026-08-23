import type {
  SetupAppliedResponse,
  SetupStateResponse,
  SetupTurnResponse,
} from '@fin/contracts';
import { describe, expect, it } from 'vitest';

import { ReadSetupState } from '../../../application/projection/uc-1-5-read-setup-state.js';
import { CompleteSetup } from '../../../application/setup/compose-setup.js';
import { SetupDraft } from '../../../application/setup/setup-draft.js';
import type {
  SetupConversations,
  SetupState,
} from '../../../application/setup/uc-1-5-converse-setup.js';
import { ConverseSetup } from '../../../application/setup/uc-1-5-converse-setup.js';
import { BackupRestore } from '../../../application/backup/uc-1-6-backup-restore.js';
import type { ScriptedTurn } from '../../../application/testing/fake-language-model.js';
import { FakeLanguageModel } from '../../../application/testing/fake-language-model.js';
import {
  FakeSetupConversationStore,
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
import {
  PaydayAnchor,
  ShiftPolicy,
} from '../../../domain/budgeting/cycle-ref.js';
import { noHolidays } from '../../../domain/ports/holiday-calendar.js';
import { LanguageModelFailed } from '../../../domain/ports/language-model.js';
import { Money } from '../../../domain/shared/money.js';
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
function wire(model: FakeLanguageModel) {
  const clock = FixedClock.at(NOW);
  const conversations: SetupConversations = new FakeSetupConversationStore();
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
    app: buildTestServer({
      converseSetup: new ConverseSetup(
        model,
        conversations,
        new SequentialIdSource('conv'),
        noHolidays,
        clock,
      ),
      completeSetup: new CompleteSetup(conversations, backup, clock),
    }),
  };
}

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
  const draft = SetupDraft.empty('2026-09', noHolidays)
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
          summary: expect.stringContaining('Paid on day 5') as string,
        },
      ],
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
        draft: SetupDraft.empty('2026-09', noHolidays),
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
