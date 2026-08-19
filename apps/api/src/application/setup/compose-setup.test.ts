import { describe, expect, it } from 'vitest';

import { AccountType } from '../../domain/budgeting/account.js';
import { PaydayAnchor, ShiftPolicy } from '../../domain/budgeting/cycle-ref.js';
import { Allocation } from '../../domain/goals/bucket.js';
import { noHolidays } from '../../domain/ports/holiday-calendar.js';
import { LocalDate } from '../../domain/shared/local-date.js';
import { Money } from '../../domain/shared/money.js';
import { Percentage } from '../../domain/shared/percentage.js';
import { BackupRestore } from '../backup/uc-1-6-backup-restore.js';
import {
  FakeSetupConversationStore,
  SequentialIdSource,
  InMemoryAccountRepository,
  InMemoryBucketRepository,
  InMemoryCardRepository,
  InMemoryCycleRepository,
  InMemorySettingsRepository,
  InMemoryTemplateRepository,
} from '../testing/fakes.js';
import { FixedClock } from '../testing/fixed-clock.js';

import {
  CompleteSetup,
  composeSetup,
  SetupNotComplete,
} from './compose-setup.js';
import type { SetupConversations } from './uc-1-5-converse-setup.js';
import { SetupConversationNotFound } from './uc-1-5-converse-setup.js';
import { SetupDraft, SetupSection } from './setup-draft.js';

const NOW = '2026-08-19T09:00:00.000Z';

const anchor = PaydayAnchor.of(5, ShiftPolicy.Preceding);

const complete = (): SetupDraft =>
  SetupDraft.empty('2026-09', noHolidays, new SequentialIdSource('rec'))
    .withAnchor(anchor)
    .addAccount({
      name: 'Checking',
      type: AccountType.Checking,
      balance: Money.fromCents(216_000),
    })
    .withSalary(Money.fromCents(1_800_000))
    .addFixedBill({
      name: 'Health Plan',
      amount: Money.fromCents(-32_000),
      dueDayOfMonth: 8,
    })
    .addVariableBill({
      name: 'Electricity',
      amount: Money.fromCents(-28_000),
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
    });

describe('composeSetup', () => {
  it('refuses a draft with a section still unanswered', () => {
    const draft = SetupDraft.empty(
      '2026-09',
      noHolidays,
      new SequentialIdSource('rec'),
    ).withAnchor(anchor);

    expect(() => composeSetup(draft, NOW)).toThrow(SetupNotComplete);
  });

  it('carries the anchor and the accounts across', () => {
    const document = composeSetup(complete(), NOW);

    expect(document.exportedAt).toBe(NOW);
    expect(document.anchor).toEqual({
      anchorDay: 5,
      shiftPolicy: ShiftPolicy.Preceding,
    });
    expect(document.accounts).toEqual([
      { id: 'acc-1', name: 'Checking', type: 'CHECKING', balance: 216_000 },
    ]);
  });

  /**
   * Templates rather than materialised cycles: the app already generates a
   * cycle from its templates, lazily and idempotently, so writing cycles here
   * would duplicate the engine and hand-chain every opening balance.
   */
  it('writes no cycles, only the templates that generate them', () => {
    const document = composeSetup(complete(), NOW);

    expect(document.cycles).toEqual([]);
    expect(document.templates.map((template) => template.name)).toEqual([
      'Salary',
      'Health Plan',
      'Electricity',
    ]);
    expect(document.templates.every((t) => t.startMonth === '2026-09')).toBe(
      true,
    );
  });

  it('dates the salary from the payday anchor and never from an answer', () => {
    const [salary] = composeSetup(complete(), NOW).templates;

    expect(salary).toMatchObject({
      direction: 'IN',
      dueDayOfMonth: 5,
      amount: 1_800_000,
      isEstimate: false,
      endMonth: null,
      status: 'ACTIVE',
      valueSchedule: [],
    });
  });

  it('keeps bills outgoing and a variable bill an estimate', () => {
    const [, fixed, variable] = composeSetup(complete(), NOW).templates;

    expect(fixed).toMatchObject({
      direction: 'OUT',
      amount: -32_000,
      dueDayOfMonth: 8,
      isEstimate: false,
    });
    expect(variable).toMatchObject({
      direction: 'OUT',
      amount: -28_000,
      dueDayOfMonth: 15,
      isEstimate: true,
    });
  });

  it('resolves the card to the account that pays it', () => {
    const document = composeSetup(complete(), NOW);

    expect(document.cards).toEqual([
      {
        id: 'card-1',
        name: 'Inter',
        limit: 1_000_000,
        closingDay: 28,
        dueDay: 10,
        paymentAccountId: 'acc-1',
        invoices: [],
        plans: [],
      },
    ]);
  });

  /**
   * The conversation never asks what is already in a bucket, so composing an
   * opening balance would be inventing one.
   */
  it('opens every bucket empty, with the rule it was given', () => {
    const document = composeSetup(complete(), NOW);

    expect(document.buckets).toEqual([
      {
        id: 'bkt-1',
        name: 'Investments',
        purpose: '',
        mode: 'ONGOING',
        status: 'ACTIVE',
        priority: 1,
        target: null,
        rule: { kind: 'PERCENT', basisPoints: 2000 },
        expectedYieldBasisPoints: null,
        events: [],
      },
    ]);
  });

  it('carries a goal bucket target and its date', () => {
    const draft = complete().addGoalBucket({
      name: 'Apartment',
      rule: Allocation.fixed(Money.fromCents(177_800)),
      priority: 2,
      target: {
        amount: Money.fromCents(15_000_000),
        date: LocalDate.parse('2031-03-01'),
      },
    });

    const [, apartment] = composeSetup(draft, NOW).buckets;

    expect(apartment).toMatchObject({
      mode: 'GOAL',
      target: { amount: 15_000_000, date: '2031-03-01' },
      rule: { kind: 'FIXED', amount: 177_800 },
    });
  });

  it('leaves out the salary template when the section was skipped', () => {
    const draft = SetupDraft.empty(
      '2026-09',
      noHolidays,
      new SequentialIdSource('rec'),
    )
      .withAnchor(anchor)
      .addAccount({
        name: 'Checking',
        type: AccountType.Checking,
        balance: Money.zero(),
      })
      .skip(SetupSection.Salary)
      .skip(SetupSection.FixedBills)
      .skip(SetupSection.VariableBills)
      .skip(SetupSection.Cards)
      .skip(SetupSection.Buckets);

    expect(composeSetup(draft, NOW).templates).toEqual([]);
  });
});

describe('CompleteSetup', () => {
  const wire = () => {
    const accounts = new InMemoryAccountRepository();
    const templates = new InMemoryTemplateRepository();
    const cards = new InMemoryCardRepository();
    const buckets = new InMemoryBucketRepository();
    const settings = new InMemorySettingsRepository();
    const conversations: SetupConversations = new FakeSetupConversationStore();

    const restore = new BackupRestore(
      new InMemoryCycleRepository(),
      accounts,
      templates,
      cards,
      buckets,
      settings,
      noHolidays,
      FixedClock.at(NOW),
    );

    return {
      accounts,
      templates,
      cards,
      buckets,
      settings,
      conversations,
      complete: new CompleteSetup(conversations, restore, FixedClock.at(NOW)),
    };
  };

  it('applies a finished conversation through the restore', async () => {
    const wired = wire();
    await wired.conversations.save({
      id: 'conv-1',
      transcript: [],
      state: { draft: complete(), section: undefined },
      records: [],
    });

    const document = await wired.complete.execute('conv-1');

    expect(document.accounts).toHaveLength(1);
    expect(await wired.accounts.findAll()).toHaveLength(1);
    expect(await wired.templates.findAll()).toHaveLength(3);
    expect(await wired.cards.findAll()).toHaveLength(1);
    expect(await wired.buckets.findAll()).toHaveLength(1);
    expect((await wired.settings.load()).dayOfMonth).toBe(5);
  });

  it('refuses a conversation it is not holding', async () => {
    await expect(wire().complete.execute('conv-9')).rejects.toBeInstanceOf(
      SetupConversationNotFound,
    );
  });
});
