import { describe, expect, it } from 'vitest';

import { AccountType } from '../../domain/budgeting/account.js';
import { PaydayAnchor, ShiftPolicy } from '../../domain/budgeting/cycle-ref.js';
import { Allocation } from '../../domain/goals/bucket.js';
import { noHolidays } from '../../domain/ports/holiday-calendar.js';
import { LocalDate } from '../../domain/shared/local-date.js';
import { Money } from '../../domain/shared/money.js';
import { Percentage } from '../../domain/shared/percentage.js';
import { WriteSetupDocument } from './write-setup-document.js';
import {
  FakeSetupConversationStore,
  SequentialIdSource,
  InMemoryAccountRepository,
  InMemoryBucketRepository,
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
    .addOngoingBucket({
      name: 'Investments',
      rule: Allocation.percentOfExpectedSurplus(Percentage.ofPercent(20)),
      priority: 1,
    });

/** A draft whose Gym on the 4th took the cycle's last day where it must. */
const withGym = (): SetupDraft =>
  complete().addFixedBill({
    name: 'Gym',
    amount: Money.fromCents(-12_000),
    dueDayOfMonth: 4,
    acceptCycleFallback: true,
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

    expect(document.composedAt).toBe(NOW);
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
      'Salário',
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

  /**
   * FIN-117 — the bill really is on the 4th, and nine of the twelve cycles
   * say so. Only the cycles that cannot reach it are materialised, each with
   * the entry the generator could never produce there. An accepted fallback
   * that did not survive composition would be worse than the refusal: the
   * user would believe it had been handled.
   */
  it('materialises an accepted fallback in the cycles that need it', () => {
    const document = composeSetup(withGym(), NOW);
    const gym = document.templates.find((template) => template.name === 'Gym');

    expect(gym?.dueDayOfMonth).toBe(4);
    expect(
      document.cycles.map((cycle) => [
        cycle.month,
        cycle.entries.map((entry) => entry.dueDate),
      ]),
    ).toEqual([
      ['2026-09', ['2026-09-03']],
      ['2026-12', ['2026-12-03']],
      ['2027-06', ['2027-06-03']],
    ]);
  });

  /**
   * The entry stands as the template's own, not as an override: an override
   * (UC-3.7) offers a revert to the projected *amount*, and there is no
   * different amount here. Keyed by the template, regeneration leaves it be.
   */
  it('writes the fallback as the entry that template would have produced', () => {
    const [september] = composeSetup(withGym(), NOW).cycles;

    expect(september).toMatchObject({
      status: 'OPEN',
      openingBalance: 0,
    });
    expect(september?.entries[0]).toMatchObject({
      description: 'Gym',
      kind: 'FIXED',
      planned: -12_000,
      actual: null,
      status: 'PENDING',
      isEstimate: false,
      origin: { kind: 'FROM_TEMPLATE', ref: 'tpl-3' },
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
      .skip(SetupSection.Buckets);

    expect(composeSetup(draft, NOW).templates).toEqual([]);
  });
});

describe('CompleteSetup', () => {
  const wire = () => {
    const accounts = new InMemoryAccountRepository();
    const templates = new InMemoryTemplateRepository();
    const buckets = new InMemoryBucketRepository();
    const settings = new InMemorySettingsRepository();
    const conversations: SetupConversations = new FakeSetupConversationStore();
    const cycles = new InMemoryCycleRepository();

    const restore = new WriteSetupDocument(
      cycles,
      accounts,
      templates,
      buckets,
      settings,
      noHolidays,
    );

    return {
      accounts,
      templates,
      buckets,
      settings,
      cycles,
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
    expect(await wired.buckets.findAll()).toHaveLength(1);
    expect((await wired.settings.load()).dayOfMonth).toBe(5);
  });

  it('restores the cycles an accepted fallback materialised', async () => {
    const wired = wire();
    await wired.conversations.save({
      id: 'conv-1',
      transcript: [],
      state: { draft: withGym(), section: undefined },
      records: [],
    });

    await wired.complete.execute('conv-1');

    expect(await wired.cycles.allMonths()).toEqual([
      '2026-09',
      '2026-12',
      '2027-06',
    ]);
  });

  it('refuses a conversation it is not holding', async () => {
    await expect(wire().complete.execute('conv-9')).rejects.toBeInstanceOf(
      SetupConversationNotFound,
    );
  });
});
