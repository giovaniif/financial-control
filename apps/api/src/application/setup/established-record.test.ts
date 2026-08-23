import { describe, expect, it } from 'vitest';

import { PaydayAnchor, ShiftPolicy } from '../../domain/budgeting/cycle-ref.js';
import { Allocation } from '../../domain/goals/bucket.js';
import { noHolidays } from '../../domain/ports/holiday-calendar.js';
import { LocalDate } from '../../domain/shared/local-date.js';
import { Money } from '../../domain/shared/money.js';
import { Percentage } from '../../domain/shared/percentage.js';
import { SequentialIdSource } from '../testing/fakes.js';

import { establishedIn, establishedOf } from './established-record.js';
import type { DraftRecord } from './setup-draft.js';
import { SetupDraft, SetupRecordNotFound } from './setup-draft.js';

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

const held = (name: string): DraftRecord => {
  const found = draft.records.find((record) => record.record.name === name);
  if (found === undefined) throw new Error(`The draft holds no ${name}.`);
  return found;
};

/**
 * The point of the whole thing: what a record carries as data and what its
 * sentence says are one record read twice, so rewording the sentence cannot
 * quietly change what the fields state — nor the other way round.
 */
describe('a record states the same thing in its fields as in its sentence', () => {
  it('an account — what kind it is and what is in it', () => {
    const established = establishedOf(held('Checking'));

    expect(established.summary).toBe(
      'Checking — a checking account holding R$ 2.160,00.',
    );
    expect(established).toMatchObject({
      section: 'ACCOUNTS',
      record: { name: 'Checking', type: 'CHECKING' },
    });
    expect(held('Checking').record).toMatchObject({
      balance: Money.fromCents(216_000),
    });
  });

  it('a fixed bill — what it costs and the day it falls due', () => {
    const established = establishedOf(held('Health Plan'));

    expect(established.summary).toBe('Health Plan — R$ 320,00 on day 8.');
    expect(established).toMatchObject({
      section: 'FIXED_BILLS',
      record: { name: 'Health Plan', dueDayOfMonth: 8, isEstimate: false },
    });
  });

  it('a variable bill — a guess, and said to be one both ways', () => {
    const established = establishedOf(held('Electricity'));

    expect(established.summary).toBe(
      'Electricity — R$ 280,00 on day 15, an estimate.',
    );
    expect(established).toMatchObject({
      section: 'VARIABLE_BILLS',
      record: { dueDayOfMonth: 15, isEstimate: true },
    });
  });

  it('a card — both days and the account that pays it', () => {
    const established = establishedOf(held('Inter'));

    expect(established.summary).toBe(
      'Inter — limit R$ 10.000,00, closing on day 28, due on day 10, paid from Checking.',
    );
    expect(established).toMatchObject({
      section: 'CARDS',
      record: { closingDay: 28, dueDay: 10, paymentAccountName: 'Checking' },
    });
  });

  it('an ongoing bucket — a share, and no target to reach', () => {
    const established = establishedOf(held('Investments'));

    expect(established.summary).toBe(
      'Investments — 20 % of Expected Surplus each cycle, funded #1.',
    );
    expect(established).toMatchObject({
      section: 'BUCKETS',
      record: { mode: 'ONGOING', priority: 1 },
    });
  });

  it('a goal bucket — the amount to reach and the date to reach it by', () => {
    const established = establishedOf(held('Apartment'));

    expect(established.summary).toBe(
      'Apartment — R$ 1.778,00 each cycle toward R$ 150.000,00 by 2031-03-05, funded #2.',
    );
    expect(established).toMatchObject({
      section: 'BUCKETS',
      record: { mode: 'GOAL', priority: 2 },
    });
  });

  it('names the record a correction addresses by the id the draft issued', () => {
    expect(establishedOf(held('Inter')).id).toBe(held('Inter').record.id);
  });
});

describe('the record a turn has just added', () => {
  it('is the one the draft did not hold before', () => {
    const before = draft;
    const after = before.addFixedBill({
      name: 'Rent',
      amount: Money.fromCents(760_000),
      dueDayOfMonth: 10,
    });

    expect(establishedIn(before, after).summary).toBe(
      'Rent — R$ 7.600,00 on day 10.',
    );
  });

  it('refuses to invent one when nothing was added', () => {
    expect(() => establishedIn(draft, draft)).toThrow(SetupRecordNotFound);
  });
});
