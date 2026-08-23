import { describe, expect, it } from 'vitest';

import { PaydayAnchor, ShiftPolicy } from '../../domain/budgeting/cycle-ref.js';
import { Allocation } from '../../domain/goals/bucket.js';
import { noHolidays } from '../../domain/ports/holiday-calendar.js';
import { LocalDate } from '../../domain/shared/local-date.js';
import { Money } from '../../domain/shared/money.js';
import { Percentage } from '../../domain/shared/percentage.js';
import {
  FakeSetupConversationStore,
  SequentialIdSource,
} from '../testing/fakes.js';

import { establishedOf } from './established-record.js';
import type { SetupSection } from './setup-draft.js';
import {
  DueDayOutsideCycle,
  SetupDraft,
  SetupRecordNotFound,
} from './setup-draft.js';
import type { SetupConversations } from './uc-1-5-converse-setup.js';
import { SetupConversationNotFound } from './uc-1-5-converse-setup.js';
import {
  CorrectSetupRecord,
  NothingToCorrect,
} from './uc-1-5-correct-record.js';

const START_MONTH = '2026-09';

/**
 * A draft as far through the conversation as cards: an account, a salary, a
 * fixed bill and a card, each holding the id a correction names.
 */
function establishedDraft(): SetupDraft {
  return SetupDraft.empty(
    START_MONTH,
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
    .addCard({
      name: 'Inter',
      limit: Money.fromCents(1_000_000),
      closingDay: 28,
      dueDay: 10,
      paymentAccountName: 'Checking',
    });
}

const ACCOUNT_ID = 'rec-1';
const BILL_ID = 'rec-2';
const CARD_ID = 'rec-3';

/**
 * `asking` carries the section rather than being one, so that a conversation
 * with nothing left to ask can be written as `{}` — an explicit `undefined`
 * would only fall back to the default.
 */
function wire(
  draft: SetupDraft = establishedDraft(),
  asking: { section?: SetupSection } = { section: 'FIXED_BILLS' },
) {
  const conversations: SetupConversations = new FakeSetupConversationStore();

  return {
    conversations,
    stored: {
      id: 'conv-1',
      transcript: [],
      state: { draft, section: asking.section },
      records: draft.records.map(establishedOf),
    },
    correctRecord: new CorrectSetupRecord(conversations),
  };
}

async function open(conversations: SetupConversations, id = 'conv-1') {
  const stored = await conversations.load(id);
  if (stored === undefined) throw new Error(`The store is not holding ${id}.`);
  return stored;
}

describe('CorrectSetupRecord.correct', () => {
  it('changes only the fields the correction states', async () => {
    const { conversations, stored, correctRecord } = wire();
    await conversations.save(stored);

    const turn = await correctRecord.correct({
      conversationId: 'conv-1',
      recordId: BILL_ID,
      correction: { amount: Money.fromCents(35_000) },
    });

    const [bill] = (await open(conversations)).state.draft.fixedBills;
    expect(bill?.name).toBe('Health Plan');
    expect(bill?.amount.cents).toBe(-35_000);
    expect(bill?.dueDayOfMonth).toBe(8);
    // The turn hands back the record as well as the sentence, so an inline
    // editor never has to read the one out of the other — FIN-124.
    expect(turn.established).toEqual([
      {
        section: 'FIXED_BILLS',
        id: BILL_ID,
        summary: expect.stringContaining('350,00') as string,
        record: expect.objectContaining({
          name: 'Health Plan',
          dueDayOfMonth: 8,
          isEstimate: false,
        }) as unknown,
      },
    ]);
  });

  /**
   * The record corrected may belong to a section already settled, and going
   * back to it would restart the conversation the edit fits into.
   */
  it('leaves the conversation asking whatever it was asking', async () => {
    const { conversations, stored, correctRecord } = wire();
    await conversations.save(stored);

    const turn = await correctRecord.correct({
      conversationId: 'conv-1',
      recordId: ACCOUNT_ID,
      correction: { balance: Money.fromCents(300_000) },
    });

    expect(turn.nextSection).toBe('FIXED_BILLS');
    expect((await open(conversations)).state.section).toBe('FIXED_BILLS');
  });

  /**
   * The draft is the only validator, on this path exactly as on the other:
   * paid on the 31st, the cycle running 31 Aug – 29 Sep never reaches a 30th
   * and the bill it would generate would go missing in silence (FIN-93).
   */
  it('refuses a due day the generator would drop, leaving the draft as it was', async () => {
    const draft = SetupDraft.empty(
      START_MONTH,
      noHolidays,
      new SequentialIdSource('rec'),
    )
      .withAnchor(PaydayAnchor.of(31, ShiftPolicy.Preceding))
      .addFixedBill({
        name: 'Rent',
        amount: Money.fromCents(250_000),
        dueDayOfMonth: 31,
      });
    const { conversations, stored, correctRecord } = wire(draft);
    await conversations.save(stored);

    await expect(
      correctRecord.correct({
        conversationId: 'conv-1',
        recordId: 'rec-1',
        correction: { dueDayOfMonth: 30 },
      }),
    ).rejects.toThrow(/nunca alcançam.*último dia/);

    const [bill] = (await open(conversations)).state.draft.fixedBills;
    expect(bill?.dueDayOfMonth).toBe(31);
  });

  /**
   * FIN-117 — the structured path answers exactly as the conversation does:
   * the refusal names the cycles it cannot place the day in and what it can
   * use there, so a form can put the offer rather than a dead end.
   */
  it('offers the cycle last day the form can put to the user', async () => {
    const { conversations, stored, correctRecord } = wire();
    await conversations.save(stored);

    const refused = await correctRecord
      .correct({
        conversationId: 'conv-1',
        recordId: BILL_ID,
        correction: { dueDayOfMonth: 4 },
      })
      .catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(DueDayOutsideCycle);
    expect((refused as DueDayOutsideCycle).cycles.map((c) => c.month)).toEqual([
      '2026-09',
      '2026-12',
      '2027-06',
    ]);
    const [bill] = (await open(conversations)).state.draft.fixedBills;
    expect(bill?.dueDayOfMonth).toBe(8);
  });

  it('takes the offer, overriding only the cycles that need it', async () => {
    const { conversations, stored, correctRecord } = wire();
    await conversations.save(stored);

    await correctRecord.correct({
      conversationId: 'conv-1',
      recordId: BILL_ID,
      correction: { dueDayOfMonth: 4, acceptCycleFallback: true },
    });

    const [bill] = (await open(conversations)).state.draft.fixedBills;
    expect(bill?.dueDayOfMonth).toBe(4);
    expect(
      bill?.dueDateOverrides.map((override) => override.date.toISO()),
    ).toEqual(['2026-09-03', '2026-12-03', '2027-06-03']);
  });

  /**
   * A correction states only what changes, so one that says nothing about the
   * day must not quietly withdraw an offer the user already accepted.
   */
  it('keeps an accepted fallback through a correction of something else', async () => {
    const { conversations, stored, correctRecord } = wire(
      establishedDraft().addFixedBill({
        name: 'Gym',
        amount: Money.fromCents(12_000),
        dueDayOfMonth: 4,
        acceptCycleFallback: true,
      }),
    );
    await conversations.save(stored);

    await correctRecord.correct({
      conversationId: 'conv-1',
      recordId: 'rec-4',
      correction: { amount: Money.fromCents(15_000) },
    });

    const gym = (await open(conversations)).state.draft.fixedBills[1];
    expect(gym?.amount.cents).toBe(-15_000);
    expect(gym?.dueDateOverrides).toHaveLength(3);
  });

  it('refuses a name another bill already holds', async () => {
    const { conversations, stored, correctRecord } = wire(
      establishedDraft().addFixedBill({
        name: 'Electricity',
        amount: Money.fromCents(28_000),
        dueDayOfMonth: 15,
      }),
    );
    await conversations.save(stored);

    await expect(
      correctRecord.correct({
        conversationId: 'conv-1',
        recordId: BILL_ID,
        correction: { name: 'Electricity' },
      }),
    ).rejects.toThrow(/Já existe/);
  });

  it('rejects a conversation nobody opened', async () => {
    const { correctRecord } = wire();

    await expect(
      correctRecord.correct({
        conversationId: 'nope',
        recordId: BILL_ID,
        correction: { amount: Money.fromCents(1) },
      }),
    ).rejects.toBeInstanceOf(SetupConversationNotFound);
  });

  it('rejects a record the draft never established', async () => {
    const { conversations, stored, correctRecord } = wire();
    await conversations.save(stored);

    await expect(
      correctRecord.correct({
        conversationId: 'conv-1',
        recordId: 'rec-99',
        correction: { amount: Money.fromCents(1) },
      }),
    ).rejects.toBeInstanceOf(SetupRecordNotFound);
  });

  /** A card's field on an account is not a correction that changes nothing. */
  it('rejects a correction stating nothing that applies to the record', async () => {
    const { conversations, stored, correctRecord } = wire();
    await conversations.save(stored);

    await expect(
      correctRecord.correct({
        conversationId: 'conv-1',
        recordId: ACCOUNT_ID,
        correction: { closingDay: 25 },
      }),
    ).rejects.toBeInstanceOf(NothingToCorrect);
  });

  it('corrects a card', async () => {
    const { conversations, stored, correctRecord } = wire();
    await conversations.save(stored);

    const turn = await correctRecord.correct({
      conversationId: 'conv-1',
      recordId: CARD_ID,
      correction: { closingDay: 25, dueDay: 5 },
    });

    const [card] = (await open(conversations)).state.draft.cards;
    expect(card?.closingDay).toBe(25);
    expect(card?.dueDay).toBe(5);
    expect(turn.message).toContain('Inter');
  });

  it('corrects a goal bucket', async () => {
    const { conversations, stored, correctRecord } = wire(
      establishedDraft().addGoalBucket({
        name: 'Apartment',
        rule: Allocation.fixed(Money.fromCents(100_000)),
        priority: 1,
        target: {
          amount: Money.fromCents(15_000_000),
          date: LocalDate.parse('2031-03-01'),
        },
      }),
      { section: 'BUCKETS' },
    );
    await conversations.save(stored);

    await correctRecord.correct({
      conversationId: 'conv-1',
      recordId: 'rec-4',
      correction: {
        rule: Allocation.percentOfExpectedSurplus(
          Percentage.ofBasisPoints(2_000),
        ),
        targetAmount: Money.fromCents(16_000_000),
      },
    });

    const [bucket] = (await open(conversations)).state.draft.buckets;
    expect(bucket?.rule.kind).toBe('PERCENT');
    expect(bucket?.mode === 'GOAL' ? bucket.target.amount.cents : 0).toBe(
      16_000_000,
    );
  });

  /**
   * The conversation must not silently diverge from the records the user can
   * see, so an edit made outside it still shows in the transcript.
   */
  it('records the correction in the transcript', async () => {
    const { conversations, stored, correctRecord } = wire();
    await conversations.save(stored);

    await correctRecord.correct({
      conversationId: 'conv-1',
      recordId: BILL_ID,
      correction: { amount: Money.fromCents(35_000) },
    });

    expect((await open(conversations)).transcript).toEqual([
      { role: 'user', text: expect.stringContaining('350,00') as string },
    ]);
  });

  /** A settled conversation is still settled: an edit is not a new question. */
  it('leaves a finished conversation ready to apply', async () => {
    const { conversations, stored, correctRecord } = wire(
      establishedDraft().skip('VARIABLE_BILLS').skip('BUCKETS'),
      {},
    );
    await conversations.save(stored);

    const turn = await correctRecord.correct({
      conversationId: 'conv-1',
      recordId: BILL_ID,
      correction: { amount: Money.fromCents(35_000) },
    });

    expect(turn.isComplete).toBe(true);
    expect(turn.nextSection).toBeUndefined();
  });

  it('replaces the record it corrected rather than listing it twice', async () => {
    const { conversations, stored, correctRecord } = wire();
    await conversations.save(stored);

    await correctRecord.correct({
      conversationId: 'conv-1',
      recordId: BILL_ID,
      correction: { name: 'Health' },
    });

    const { records } = await open(conversations);
    expect(records.filter((record) => record.id === BILL_ID)).toHaveLength(1);
    expect(records).toHaveLength(3);
  });
});

describe('CorrectSetupRecord.remove', () => {
  it('drops the record the id names', async () => {
    const { conversations, stored, correctRecord } = wire();
    await conversations.save(stored);

    const turn = await correctRecord.remove({
      conversationId: 'conv-1',
      recordId: BILL_ID,
    });

    expect(turn.removed).toEqual([BILL_ID]);
    expect((await open(conversations)).state.draft.fixedBills).toEqual([]);
    expect((await open(conversations)).records).toHaveLength(2);
  });

  /** Dropped is not skipped: a section a removal emptied is asked again. */
  it('asks again about a section its last record left', async () => {
    const { conversations, stored, correctRecord } = wire(
      establishedDraft().skip('VARIABLE_BILLS').skip('BUCKETS'),
      {},
    );
    await conversations.save(stored);

    const turn = await correctRecord.remove({
      conversationId: 'conv-1',
      recordId: BILL_ID,
    });

    expect(turn.nextSection).toBe('FIXED_BILLS');
    expect(turn.isComplete).toBe(false);
  });

  it('refuses to drop an account a card is paid from', async () => {
    const { conversations, stored, correctRecord } = wire();
    await conversations.save(stored);

    await expect(
      correctRecord.remove({ conversationId: 'conv-1', recordId: ACCOUNT_ID }),
    ).rejects.toThrow(/Inter/);
  });

  it('rejects a conversation nobody opened', async () => {
    const { correctRecord } = wire();

    await expect(
      correctRecord.remove({ conversationId: 'nope', recordId: BILL_ID }),
    ).rejects.toBeInstanceOf(SetupConversationNotFound);
  });

  it('rejects a record the draft never established', async () => {
    const { conversations, stored, correctRecord } = wire();
    await conversations.save(stored);

    await expect(
      correctRecord.remove({ conversationId: 'conv-1', recordId: 'rec-99' }),
    ).rejects.toBeInstanceOf(SetupRecordNotFound);
  });

  it('records the removal in the transcript', async () => {
    const { conversations, stored, correctRecord } = wire();
    await conversations.save(stored);

    await correctRecord.remove({ conversationId: 'conv-1', recordId: CARD_ID });

    expect((await open(conversations)).transcript).toEqual([
      { role: 'user', text: expect.stringContaining('Inter') as string },
    ]);
  });
});
