import { describe, expect, it } from 'vitest';

import { ShiftPolicy } from '../../domain/budgeting/cycle-ref.js';
import { EntryKind } from '../../domain/budgeting/ledger-entry.js';
import { Direction } from '../../domain/budgeting/recurring-template.js';
import { Allocation } from '../../domain/goals/bucket.js';
import { LocalDate } from '../../domain/shared/local-date.js';
import { Money } from '../../domain/shared/money.js';
import { Percentage } from '../../domain/shared/percentage.js';
import { SettlementStatus } from '../../domain/shared/planned-actual.js';
import { EditScope } from '../budgeting/uc-2-manage-templates.js';

import type { ProposedChange } from './proposed-change.js';
import { summarise, UnknownProposal } from './proposed-change.js';

const reais = (amount: number) => Money.fromCents(Math.round(amount * 100));

const settleRent: ProposedChange = {
  kind: 'SETTLE_ENTRY',
  month: '2026-10',
  entryId: 'rent-1',
  status: SettlementStatus.Paid,
  actual: reais(-7_610),
};

describe('summarise — the sentence the user confirms', () => {
  it.each<[string, ProposedChange, string]>([
    [
      'settling at an actual amount',
      settleRent,
      'Settle entry rent-1 in the 2026-10 cycle as paid, at R$ -7.610,00.',
    ],
    [
      'settling at the planned amount',
      { ...settleRent, actual: undefined },
      'Settle entry rent-1 in the 2026-10 cycle as paid, at its planned amount.',
    ],
    [
      'adding an ad-hoc entry',
      {
        kind: 'ADD_ENTRY',
        month: '2026-10',
        description: 'Dentist',
        entryKind: EntryKind.Variable,
        dueDate: LocalDate.parse('2026-09-20'),
        amount: reais(-300),
        isEstimate: false,
      },
      'Add “Dentist” to the 2026-10 cycle — a variable of R$ -300,00 due on 2026-09-20.',
    ],
    [
      'adding an entry that is only an estimate',
      {
        kind: 'ADD_ENTRY',
        month: '2026-10',
        description: 'Contractor',
        entryKind: EntryKind.Fixed,
        dueDate: LocalDate.parse('2026-09-20'),
        amount: reais(-1_500),
        isEstimate: true,
      },
      'Add “Contractor” to the 2026-10 cycle — a fixed of R$ -1.500,00 due on 2026-09-20, an estimate.',
    ],
    [
      'a purchase split across instalments',
      {
        kind: 'REGISTER_PURCHASE',
        cardId: 'inter',
        description: 'Laptop',
        purchasedOn: LocalDate.parse('2026-08-18'),
        amount: reais(6_000),
        installments: 10,
      },
      'Register “Laptop” of R$ 6.000,00 on card inter, bought on 2026-08-18, in 10 instalments.',
    ],
    [
      'a purchase in one payment',
      {
        kind: 'REGISTER_PURCHASE',
        cardId: 'inter',
        description: 'Books',
        purchasedOn: LocalDate.parse('2026-08-18'),
        amount: reais(120),
        installments: 1,
      },
      'Register “Books” of R$ 120,00 on card inter, bought on 2026-08-18, in one payment.',
    ],
    [
      'a recurring outcome',
      {
        kind: 'CREATE_TEMPLATE',
        name: 'Health Plan',
        direction: Direction.Out,
        dueDayOfMonth: 8,
        amount: reais(-320),
        startMonth: '2026-10',
        endMonth: undefined,
        isEstimate: false,
      },
      'Create the recurring outcome “Health Plan” of R$ -320,00 on day 8, from the 2026-10 cycle.',
    ],
    [
      'a recurring income that ends',
      {
        kind: 'CREATE_TEMPLATE',
        name: 'Consulting',
        direction: Direction.In,
        dueDayOfMonth: 20,
        amount: reais(2_000),
        startMonth: undefined,
        endMonth: '2027-03',
        isEstimate: true,
      },
      'Create the recurring income “Consulting” of R$ 2.000,00 on day 20, from the current cycle until the 2027-03 cycle, an estimate.',
    ],
    [
      'a template amount changing from here on',
      {
        kind: 'CHANGE_TEMPLATE_AMOUNT',
        templateId: 'salary',
        fromMonth: '2026-11',
        amount: reais(18_000),
        scope: EditScope.ThisAndFuture,
      },
      'Change template salary to R$ 18.000,00 from the 2026-11 cycle, this cycle and every future one.',
    ],
    [
      'a template amount changing once',
      {
        kind: 'CHANGE_TEMPLATE_AMOUNT',
        templateId: 'salary',
        fromMonth: '2026-11',
        amount: reais(18_000),
        scope: EditScope.ThisCycleOnly,
      },
      'Change template salary to R$ 18.000,00 from the 2026-11 cycle, this cycle only.',
    ],
    [
      'moving the payday anchor',
      {
        kind: 'CHANGE_PAYDAY_ANCHOR',
        anchorDay: 7,
        shiftPolicy: ShiftPolicy.Following,
      },
      'Move the payday anchor to day 7, taking the following business day when that one is closed.',
    ],
    [
      'a goal bucket',
      {
        kind: 'CREATE_GOAL_BUCKET',
        name: 'Apartment',
        target: reais(150_000),
        targetDate: LocalDate.parse('2031-03-05'),
        rule: Allocation.percentOfExpectedSurplus(Percentage.ofPercent(20)),
        priority: 2,
      },
      'Create the goal bucket “Apartment” — 20 % of Expected Surplus each cycle toward R$ 150.000,00 by 2031-03-05, funded #2.',
    ],
    [
      'an ongoing bucket',
      {
        kind: 'CREATE_ONGOING_BUCKET',
        name: 'Investments',
        rule: Allocation.fixed(reais(1_778)),
        priority: 3,
      },
      'Create the ongoing bucket “Investments” — R$ 1.778,00 each cycle, funded #3.',
    ],
    [
      'a rule change',
      {
        kind: 'CHANGE_ALLOCATION_RULE',
        bucketId: 'apartment',
        rule: Allocation.percentOfExpectedSurplus(Percentage.ofPercent(25)),
      },
      'Change bucket apartment to take 25 % of Expected Surplus each cycle.',
    ],
    [
      'a one-off contribution',
      {
        kind: 'OVERRIDE_CONTRIBUTION',
        bucketId: 'reserve',
        month: '2026-10',
        amount: reais(500),
      },
      'Put R$ 500,00 into bucket reserve for the 2026-10 cycle, this once.',
    ],
  ])('describes %s', (_name, change, expected) => {
    expect(summarise(change)).toBe(expected);
  });

  it('names every field that would be written, so a swap is visible', () => {
    expect(summarise({ ...settleRent, entryId: 'rent-2' })).not.toBe(
      summarise(settleRent),
    );
    expect(summarise({ ...settleRent, actual: reais(-7_611) })).not.toBe(
      summarise(settleRent),
    );
  });

  it('refuses a kind it does not know rather than describing it vaguely', () => {
    expect(() =>
      summarise({ kind: 'SELL_THE_HOUSE' } as unknown as ProposedChange),
    ).toThrow(UnknownProposal);
  });
});
