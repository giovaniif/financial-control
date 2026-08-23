import { describe, expect, it } from 'vitest';

import { AccountType } from '../../domain/budgeting/account.js';
import { PaydayAnchor, ShiftPolicy } from '../../domain/budgeting/cycle-ref.js';
import { Allocation } from '../../domain/goals/bucket.js';
import { noHolidays } from '../../domain/ports/holiday-calendar.js';
import { LocalDate } from '../../domain/shared/local-date.js';
import { Money } from '../../domain/shared/money.js';
import { Percentage } from '../../domain/shared/percentage.js';
import { SequentialIdSource } from '../testing/fakes.js';

import {
  AnchorNotChosen,
  DueDayOutsideCycle,
  InvalidSetupRecord,
  SectionCannotBeSkipped,
  SETUP_SECTIONS,
  SetupDraft,
  SetupRecordNotFound,
  SetupSection,
} from './setup-draft.js';

/** A named attempt to build a draft, so a rejection table reads as prose. */
type Attempt = readonly [string, () => SetupDraft];

const anchor = (day: number, policy: ShiftPolicy = ShiftPolicy.Preceding) =>
  PaydayAnchor.of(day, policy);

const empty = (startMonth = '2026-09') =>
  SetupDraft.empty(startMonth, noHolidays, new SequentialIdSource('rec'));

const withAnchor = (day = 5) => empty().withAnchor(anchor(day));

const account = (name = 'Checking') => ({
  name,
  type: AccountType.Checking,
  balance: Money.fromCents(216_000),
});

const bill = (name = 'Health Plan', dueDayOfMonth = 8) => ({
  name,
  amount: Money.fromCents(32_000),
  dueDayOfMonth,
});

const card = (name = 'Inter') => ({
  name,
  limit: Money.fromCents(1_000_000),
  closingDay: 28,
  dueDay: 10,
  paymentAccountName: 'Checking',
});

const ongoing = (name = 'Investments', priority = 1) => ({
  name,
  rule: Allocation.percentOfExpectedSurplus(Percentage.ofPercent(20)),
  priority,
});

const goal = (name = 'Apartment', priority = 1) => ({
  ...ongoing(name, priority),
  target: {
    amount: Money.fromCents(15_000_000),
    date: LocalDate.parse('2031-03-31'),
  },
});

/** Every section answered — the state a composition may run on. */
const settled = () =>
  withAnchor()
    .addAccount(account())
    .withSalary(Money.fromCents(1_800_000))
    .addFixedBill(bill())
    .addVariableBill(bill('Electricity', 15))
    .addCard(card())
    .addOngoingBucket(ongoing());

describe('SetupDraft sections', () => {
  it('asks for its sections in the order each depends on the last', () => {
    expect([...SETUP_SECTIONS]).toEqual([
      'ANCHOR',
      'ACCOUNTS',
      'SALARY',
      'FIXED_BILLS',
      'VARIABLE_BILLS',
      'CARDS',
      'BUCKETS',
    ]);
  });

  it('needs every section while it is empty', () => {
    expect(empty().remainingSections).toEqual([...SETUP_SECTIONS]);
    expect(empty().nextSection).toBe(SetupSection.Anchor);
    expect(empty().isComplete).toBe(false);
  });

  const answered: readonly [SetupSection, () => SetupDraft][] = [
    [SetupSection.Anchor, () => withAnchor()],
    [SetupSection.Accounts, () => withAnchor().addAccount(account())],
    [
      SetupSection.Salary,
      () => withAnchor().withSalary(Money.fromCents(1_800_000)),
    ],
    [SetupSection.FixedBills, () => withAnchor().addFixedBill(bill())],
    [SetupSection.VariableBills, () => withAnchor().addVariableBill(bill())],
    [
      SetupSection.Cards,
      () => withAnchor().addAccount(account()).addCard(card()),
    ],
    [SetupSection.Buckets, () => withAnchor().addOngoingBucket(ongoing())],
  ];

  it.each(answered)(
    'stops asking for %s once it is answered',
    (section, build) => {
      expect(build().remainingSections).not.toContain(section);
    },
  );

  it('settles a section that is skipped rather than answered', () => {
    const skipped = withAnchor().skip(SetupSection.Cards);

    expect(skipped.remainingSections).not.toContain(SetupSection.Cards);
    expect(skipped.cards).toEqual([]);
  });

  it('refuses to skip the payday anchor, which every date depends on', () => {
    expect(() => empty().skip(SetupSection.Anchor)).toThrow(
      SectionCannotBeSkipped,
    );
  });

  it('is complete once every section is answered', () => {
    expect(settled().remainingSections).toEqual([]);
    expect(settled().isComplete).toBe(true);
    expect(settled().nextSection).toBeUndefined();
  });

  it('is complete when the sections nobody answered were skipped', () => {
    const skippedThrough = withAnchor()
      .addAccount(account())
      .withSalary(Money.fromCents(1_800_000))
      .skip(SetupSection.FixedBills)
      .skip(SetupSection.VariableBills)
      .skip(SetupSection.Cards)
      .skip(SetupSection.Buckets);

    expect(skippedThrough.isComplete).toBe(true);
  });

  it('is not complete while one section is still unanswered', () => {
    const withoutBuckets = withAnchor()
      .addAccount(account())
      .withSalary(Money.fromCents(1_800_000))
      .skip(SetupSection.FixedBills)
      .skip(SetupSection.VariableBills)
      .skip(SetupSection.Cards);

    expect(withoutBuckets.isComplete).toBe(false);
    expect(withoutBuckets.nextSection).toBe(SetupSection.Buckets);
  });

  it('rejects a start month that is not a YYYY-MM month', () => {
    expect(() => empty('September')).toThrow(InvalidSetupRecord);
  });

  it('keeps the month the setup starts from, which dates every template', () => {
    expect(empty('2026-09').startMonth).toBe('2026-09');
  });
});

describe('SetupDraft immutability', () => {
  it('returns a new draft rather than changing the one it was given', () => {
    const before = withAnchor();
    const after = before.addAccount(account());

    expect(before.accounts).toEqual([]);
    expect(after.accounts).toHaveLength(1);
    expect(after).not.toBe(before);
  });

  it('leaves the draft untouched when a record is refused', () => {
    const before = withAnchor().addFixedBill(bill());

    expect(() => before.addFixedBill(bill('Health Plan', 9))).toThrow(
      InvalidSetupRecord,
    );
    expect(before.fixedBills).toHaveLength(1);
  });
});

describe('SetupDraft accounts', () => {
  it('keeps the account it was given', () => {
    expect(withAnchor().addAccount(account()).accounts).toEqual([
      {
        id: 'rec-1',
        name: 'Checking',
        type: 'CHECKING',
        balance: Money.fromCents(216_000),
      },
    ]);
  });

  it('accepts an overdrawn account, which is a real state', () => {
    const overdrawn = withAnchor().addAccount({
      ...account(),
      balance: Money.fromCents(-5_000),
    });

    expect(overdrawn.accounts[0]?.balance.cents).toBe(-5_000);
  });

  const refused: readonly Attempt[] = [
    ['a nameless account', () => withAnchor().addAccount(account('   '))],
    [
      'a second account by the same name',
      () => withAnchor().addAccount(account()).addAccount(account('checking')),
    ],
  ];

  it.each(refused)('rejects %s', (_name, build) => {
    expect(build).toThrow(InvalidSetupRecord);
  });
});

describe('SetupDraft salary', () => {
  it('keeps the amount, and nothing else', () => {
    expect(
      withAnchor().withSalary(Money.fromCents(1_800_000)).salary?.cents,
    ).toBe(1_800_000);
  });

  /**
   * FIN-92 and FIN-94: the payday anchor already is the salary's date, so the
   * draft answers that question rather than carrying an answer of its own —
   * there is no due day to give it, and nothing to ask the user for.
   */
  it('dates the salary from the payday anchor', () => {
    expect(withAnchor(5).salaryDueDayOfMonth).toBe(5);
    expect(empty().salaryDueDayOfMonth).toBeUndefined();
  });

  const refused: readonly Attempt[] = [
    ['a salary of nothing', () => withAnchor().withSalary(Money.zero())],
    [
      'a salary that is money going out',
      () => withAnchor().withSalary(Money.fromCents(-1_800_000)),
    ],
  ];

  it.each(refused)('rejects %s', (_name, build) => {
    expect(build).toThrow(InvalidSetupRecord);
  });
});

describe('SetupDraft bills', () => {
  const beforeTheAnchor: readonly Attempt[] = [
    ['a fixed bill', () => empty().addFixedBill(bill())],
    ['a variable bill', () => empty().addVariableBill(bill())],
  ];

  it.each(beforeTheAnchor)(
    'needs the payday anchor before it can place %s',
    (_name, build) => {
      expect(build).toThrow(AnchorNotChosen);
    },
  );

  /**
   * The sign is normalised rather than demanded: "320" and "-320" are the same
   * statement about a bill, and refusing one of them would be a correction
   * prompt about nothing. Outgoing money is negative once it is in the draft.
   */
  it.each([32_000, -32_000])(
    'holds a bill of %s as outgoing money',
    (cents) => {
      const draft = withAnchor().addFixedBill({
        ...bill(),
        amount: Money.fromCents(cents),
      });

      expect(draft.fixedBills[0]?.amount.cents).toBe(-32_000);
    },
  );

  it('tags a variable bill as an estimate, and a fixed one as known', () => {
    const draft = withAnchor()
      .addFixedBill(bill())
      .addVariableBill(bill('Electricity', 15));

    expect(draft.fixedBills[0]?.isEstimate).toBe(false);
    expect(draft.variableBills[0]?.isEstimate).toBe(true);
  });

  it('keeps a fixed bill the user is only guessing at as an estimate', () => {
    const draft = withAnchor().addFixedBill({ ...bill(), isEstimate: true });

    expect(draft.fixedBills[0]?.isEstimate).toBe(true);
  });

  it('takes a variable bill the user has confirmed as confirmed', () => {
    const draft = withAnchor().addVariableBill({
      ...bill(),
      isEstimate: false,
    });

    expect(draft.variableBills[0]?.isEstimate).toBe(false);
  });

  const refused: readonly Attempt[] = [
    [
      'a nameless bill',
      () => withAnchor().addFixedBill({ ...bill(), name: ' ' }),
    ],
    [
      'a bill of nothing',
      () => withAnchor().addFixedBill({ ...bill(), amount: Money.zero() }),
    ],
    ['a due day of 0', () => withAnchor().addFixedBill(bill('Rent', 0))],
    ['a due day of 32', () => withAnchor().addFixedBill(bill('Rent', 32))],
    ['a due day of 47', () => withAnchor().addFixedBill(bill('Rent', 47))],
    [
      'a fractional due day',
      () => withAnchor().addFixedBill(bill('Rent', 5.5)),
    ],
    [
      'a name a fixed bill already holds',
      () =>
        withAnchor()
          .addFixedBill(bill())
          .addVariableBill(bill('health plan', 9)),
    ],
    [
      'a name a variable bill already holds',
      () =>
        withAnchor()
          .addVariableBill(bill())
          .addFixedBill(bill('health plan', 9)),
    ],
  ];

  it.each(refused)('rejects %s', (_name, build) => {
    expect(build).toThrow(InvalidSetupRecord);
  });

  /**
   * A day the cycle never reaches generates nothing at all, silently: with pay
   * on the 31st the September cycle runs 31 Aug – 29 Sep, and a 30th belongs
   * to neither month it spans. Better to refuse it and name the cycle.
   */
  it('rejects a due day a cycle in the window never reaches', () => {
    expect(() => withAnchor(31).addFixedBill(bill('Rent', 30))).toThrow(
      DueDayOutsideCycle,
    );
  });

  it('names the bill, the day and the cycle that cannot place it', () => {
    expect(() => withAnchor(31).addVariableBill(bill('Rent', 30))).toThrow(
      /Rent.*dia 30.*ciclo de Setembro de 2026 \(2026-08-31 – 2026-09-29\)/,
    );
  });

  /**
   * FIN-93: an anchor of 31 opens half its cycles in a 30-day month, and the
   * day the import complained about was the anchor the user had just chosen.
   * The generator clamps a due day onto the month's last day, so the draft
   * asks it rather than answering the same question a second, stricter way.
   */
  it('accepts a due day of 31 under an anchor of 31', () => {
    expect(
      withAnchor(31).addFixedBill(bill('Rent', 31)).fixedBills,
    ).toHaveLength(1);
  });

  it('re-checks the bills it already holds when the anchor changes', () => {
    const draft = withAnchor(5).addFixedBill(bill('Rent', 30));

    expect(() => draft.withAnchor(anchor(31))).toThrow(DueDayOutsideCycle);
    expect(draft.anchor?.dayOfMonth).toBe(5);
  });

  it('takes a corrected anchor the bills it holds still fit', () => {
    const draft = withAnchor(5).addFixedBill(bill()).withAnchor(anchor(7));

    expect(draft.anchor?.dayOfMonth).toBe(7);
    expect(draft.fixedBills).toHaveLength(1);
  });
});

/**
 * FIN-117 — a bill on the 4th is a real bill. With pay on the 5th and the
 * preceding-business-day rule, a cycle whose next payday moves back to the 3rd
 * runs 5 Aug – 3 Sep and never reaches a 4th, roughly twice a year. Refusing
 * the whole bill leaves the user inventing a day; the refusal has to carry
 * enough for a caller to offer the cycle's last day instead.
 */
describe('SetupDraft due days a cycle cannot reach', () => {
  const refusal = (attempt: () => SetupDraft): DueDayOutsideCycle => {
    try {
      attempt();
    } catch (error) {
      if (error instanceof DueDayOutsideCycle) return error;
      throw error;
    }
    throw new Error('The draft placed a due day it should have refused.');
  };

  const gym = (dueDayOfMonth = 4) => bill('Gym', dueDayOfMonth);

  it('names every cycle that cannot place the day, and what it offers there', () => {
    const refused = refusal(() => withAnchor(5).addFixedBill(gym()));

    expect(refused.dueDayOfMonth).toBe(4);
    expect(
      refused.cycles.map((cycle) => [
        cycle.month,
        cycle.label,
        cycle.range,
        cycle.fallbackDayOfMonth,
        cycle.fallbackDate.toISO(),
      ]),
    ).toEqual([
      [
        '2026-09',
        'Setembro de 2026',
        '2026-08-05 – 2026-09-03',
        3,
        '2026-09-03',
      ],
      [
        '2026-12',
        'Dezembro de 2026',
        '2026-11-05 – 2026-12-03',
        3,
        '2026-12-03',
      ],
      ['2027-06', 'Junho de 2027', '2027-05-05 – 2027-06-03', 3, '2027-06-03'],
    ]);
  });

  it('offers the one cycle its own last day, and the day everywhere else', () => {
    const refused = refusal(() => withAnchor(7).addFixedBill(gym(5)));

    expect(refused.message).toMatch(
      /Gym.*dia 5.*ciclo de Fevereiro de 2027 \(2027-01-07 – 2027-02-04\).*2027-02-04.*dia 5 em todos os outros/,
    );
  });

  it('leaves the draft holding nothing when the offer is declined', () => {
    const draft = withAnchor(5);

    expect(() => draft.addFixedBill(gym())).toThrow(DueDayOutsideCycle);
    expect(draft.fixedBills).toEqual([]);
  });

  /**
   * The bill really is on the 4th and nine of the twelve cycles say so — only
   * the three that cannot reach it take the fallback. Changing the due day
   * itself would be a lie about the bill.
   */
  it('overrides only the cycles that cannot place the day', () => {
    const [accepted] = withAnchor(5).addFixedBill({
      ...gym(),
      acceptCycleFallback: true,
    }).fixedBills;

    expect(accepted?.dueDayOfMonth).toBe(4);
    expect(
      accepted?.dueDateOverrides.map((override) => [
        override.month,
        override.date.toISO(),
      ]),
    ).toEqual([
      ['2026-09', '2026-09-03'],
      ['2026-12', '2026-12-03'],
      ['2027-06', '2027-06-03'],
    ]);
  });

  it('overrides nothing when every cycle already reaches the day', () => {
    const [accepted] = withAnchor(5).addFixedBill({
      ...gym(8),
      acceptCycleFallback: true,
    }).fixedBills;

    expect(accepted?.dueDateOverrides).toEqual([]);
  });

  it('takes the offer on a variable bill too', () => {
    const [accepted] = withAnchor(5).addVariableBill({
      ...gym(),
      acceptCycleFallback: true,
    }).variableBills;

    expect(accepted?.dueDateOverrides).toHaveLength(3);
  });

  /**
   * The user agreed to the cycle's last day for this bill, not to three
   * particular dates: a corrected anchor re-slices every cycle, so the
   * fallbacks are worked out again rather than carried over.
   */
  it('works the fallbacks out again when the anchor changes', () => {
    const draft = withAnchor(5)
      .addFixedBill({ ...gym(), acceptCycleFallback: true })
      .withAnchor(anchor(7));

    const [accepted] = draft.fixedBills;
    expect(accepted?.dueDayOfMonth).toBe(4);
    expect(accepted?.dueDateOverrides).toEqual([]);
  });
});

describe('SetupDraft cards', () => {
  it('keeps the card and the account it is paid from', () => {
    const draft = withAnchor().addAccount(account()).addCard(card());

    expect(draft.cards[0]?.paymentAccountName).toBe('Checking');
    expect(draft.cards[0]?.limit.cents).toBe(1_000_000);
  });

  /**
   * An invoice due date is a real date, and cycles tile the calendar with no
   * gap, so one always lands in a cycle. The gap that catches a bill's due day
   * cannot catch a card's, and applying the rule here would refuse a card that
   * works perfectly.
   */
  it('accepts a due day the same anchor would refuse for a bill', () => {
    const draft = withAnchor(31)
      .addAccount(account())
      .addCard({ ...card(), dueDay: 30 });

    expect(draft.cards).toHaveLength(1);
  });

  const refused: readonly Attempt[] = [
    [
      'a nameless card',
      () =>
        withAnchor()
          .addAccount(account())
          .addCard({ ...card(), name: '' }),
    ],
    [
      'a negative limit',
      () =>
        withAnchor()
          .addAccount(account())
          .addCard({ ...card(), limit: Money.fromCents(-1) }),
    ],
    [
      'a closing day of 0',
      () =>
        withAnchor()
          .addAccount(account())
          .addCard({ ...card(), closingDay: 0 }),
    ],
    [
      'a due day of 32',
      () =>
        withAnchor()
          .addAccount(account())
          .addCard({ ...card(), dueDay: 32 }),
    ],
    [
      'a card paid from an account the draft does not hold',
      () => withAnchor().addCard(card()),
    ],
    [
      'a second card by the same name',
      () =>
        withAnchor()
          .addAccount(account())
          .addCard(card())
          .addCard(card('inter')),
    ],
  ];

  it.each(refused)('rejects %s', (_name, build) => {
    expect(build).toThrow(InvalidSetupRecord);
  });
});

describe('SetupDraft buckets', () => {
  it('carries a goal with its target, and an ongoing bucket without one', () => {
    const draft = withAnchor()
      .addGoalBucket(goal())
      .addOngoingBucket(ongoing('Investments', 2));

    const [first, second] = draft.buckets;

    expect(first?.mode === 'GOAL' ? first.target.amount.cents : undefined).toBe(
      15_000_000,
    );
    expect(second?.mode).toBe('ONGOING');
  });

  /** UC-6.4 — the app detects over-commitment; it does not refuse to hold it. */
  it('allows a rule asking for more than the whole surplus', () => {
    const draft = withAnchor().addOngoingBucket({
      ...ongoing(),
      rule: Allocation.percentOfExpectedSurplus(Percentage.ofPercent(120)),
    });

    expect(draft.buckets).toHaveLength(1);
  });

  it('takes a fixed rule as the amount per cycle', () => {
    const draft = withAnchor().addOngoingBucket({
      ...ongoing(),
      rule: Allocation.fixed(Money.fromCents(177_800)),
    });

    expect(draft.buckets[0]?.rule).toEqual(
      Allocation.fixed(Money.fromCents(177_800)),
    );
  });

  const refused: readonly Attempt[] = [
    ['a nameless bucket', () => withAnchor().addOngoingBucket(ongoing(''))],
    [
      'a rule asking for no percentage at all',
      () =>
        withAnchor().addOngoingBucket({
          ...ongoing(),
          rule: Allocation.percentOfExpectedSurplus(Percentage.zero()),
        }),
    ],
    [
      'a rule asking for no money at all',
      () =>
        withAnchor().addOngoingBucket({
          ...ongoing(),
          rule: Allocation.fixed(Money.zero()),
        }),
    ],
    [
      'a goal with a target of nothing',
      () =>
        withAnchor().addGoalBucket({
          ...goal(),
          target: {
            amount: Money.zero(),
            date: LocalDate.parse('2031-03-31'),
          },
        }),
    ],
    [
      'a priority below one',
      () => withAnchor().addOngoingBucket(ongoing('Investments', 0)),
    ],
    [
      'a fractional priority',
      () => withAnchor().addOngoingBucket(ongoing('Investments', 1.5)),
    ],
    [
      'a priority another bucket already holds',
      () =>
        withAnchor()
          .addOngoingBucket(ongoing('Investments', 1))
          .addGoalBucket(goal('Apartment', 1)),
    ],
    [
      'a name another bucket already holds',
      () =>
        withAnchor()
          .addOngoingBucket(ongoing('Investments', 1))
          .addGoalBucket(goal('investments', 2)),
    ],
  ];

  it.each(refused)('rejects %s', (_name, build) => {
    expect(build).toThrow(InvalidSetupRecord);
  });
});

describe('SetupDraft record identity', () => {
  it('gives every record it establishes an id of its own', () => {
    const draft = withAnchor().addAccount(account()).addFixedBill(bill());

    expect(draft.accounts[0]?.id).toBe('rec-1');
    expect(draft.fixedBills[0]?.id).toBe('rec-2');
  });

  /** `settled()` establishes one of each, in the order the sections are asked. */
  const kinds: readonly [string, string, SetupSection][] = [
    ['an account', 'rec-1', SetupSection.Accounts],
    ['a fixed bill', 'rec-2', SetupSection.FixedBills],
    ['a variable bill', 'rec-3', SetupSection.VariableBills],
    ['a card', 'rec-4', SetupSection.Cards],
    ['a bucket', 'rec-5', SetupSection.Buckets],
  ];

  it.each(kinds)('finds %s by its id', (_name, recordId, section) => {
    const found = settled().find(recordId);

    expect(found?.section).toBe(section);
    expect(found?.record.id).toBe(recordId);
  });

  it('holds every record it can be asked to correct in one list', () => {
    expect(settled().records.map((held) => held.record.id)).toEqual([
      'rec-1',
      'rec-2',
      'rec-3',
      'rec-4',
      'rec-5',
    ]);
  });

  it('finds nothing under an id it never issued', () => {
    expect(settled().find('rec-9')).toBeUndefined();
  });
});

describe('SetupDraft corrections', () => {
  it('takes a corrected amount without moving the record', () => {
    const corrected = settled().replaceFixedBill('rec-2', {
      ...bill(),
      amount: Money.fromCents(35_000),
    });

    expect(corrected.fixedBills).toHaveLength(1);
    expect(corrected.fixedBills[0]?.id).toBe('rec-2');
    expect(corrected.fixedBills[0]?.amount.cents).toBe(-35_000);
  });

  it('returns a new draft rather than changing the one it was given', () => {
    const before = settled();
    const after = before.replaceFixedBill('rec-2', {
      ...bill(),
      amount: Money.fromCents(35_000),
    });

    expect(before.fixedBills[0]?.amount.cents).toBe(-32_000);
    expect(after).not.toBe(before);
  });

  /**
   * FIN-93 and FIN-117: the placement rule is what a mis-extracted due day
   * gets wrong, so a correction is checked exactly as an addition is. Trusting
   * it because the record it replaces was valid is the whole bug.
   */
  it('re-runs the placement rule on a corrected due day', () => {
    const before = withAnchor(31).addFixedBill(bill('Rent', 31));

    expect(() => before.replaceFixedBill('rec-1', bill('Rent', 30))).toThrow(
      DueDayOutsideCycle,
    );
  });

  it('leaves the record it could not replace exactly as it was', () => {
    const before = withAnchor(31).addFixedBill(bill('Rent', 31));

    expect(() => before.replaceFixedBill('rec-1', bill('Rent', 30))).toThrow(
      DueDayOutsideCycle,
    );
    expect(before.fixedBills).toHaveLength(1);
    expect(before.fixedBills[0]?.dueDayOfMonth).toBe(31);
  });

  it('corrects the record named and leaves the others where they are', () => {
    const corrected = withAnchor()
      .addFixedBill(bill())
      .addFixedBill(bill('Internet', 20))
      .replaceFixedBill('rec-1', {
        ...bill(),
        amount: Money.fromCents(35_000),
      });

    expect(corrected.fixedBills.map((held) => held.name)).toEqual([
      'Health Plan',
      'Internet',
    ]);
    expect(corrected.fixedBills[0]?.amount.cents).toBe(-35_000);
    expect(corrected.fixedBills[1]?.amount.cents).toBe(-32_000);
  });

  it('leaves a card alone when the account corrected is not the one paying it', () => {
    const corrected = settled()
      .addAccount(account('Nubank'))
      .replaceAccount('rec-6', account('Nu'));

    expect(corrected.cards[0]?.paymentAccountName).toBe('Checking');
    expect(corrected.accounts[1]?.name).toBe('Nu');
  });

  it('lets a record keep the name it already holds', () => {
    const corrected = settled().replaceVariableBill('rec-3', {
      ...bill('Electricity', 15),
      amount: Money.fromCents(31_000),
    });

    expect(corrected.variableBills[0]?.name).toBe('Electricity');
  });

  it('refuses a correction onto a name another record already holds', () => {
    expect(() =>
      settled().replaceVariableBill('rec-3', bill('health plan', 8)),
    ).toThrow(InvalidSetupRecord);
  });

  it('takes a corrected account, its kind and its balance', () => {
    const corrected = settled().replaceAccount('rec-1', {
      name: 'Nubank',
      type: AccountType.Savings,
      balance: Money.fromCents(500_000),
    });

    expect(corrected.accounts[0]?.name).toBe('Nubank');
    expect(corrected.accounts[0]?.type).toBe(AccountType.Savings);
    expect(corrected.accounts[0]?.balance.cents).toBe(500_000);
  });

  /**
   * A card names the account that pays it, and the draft holds no ids for the
   * conversation to use — so a corrected account name has to travel with it or
   * the card would be left naming an account nothing holds.
   */
  it('carries a renamed account through to the card it pays', () => {
    const corrected = settled().replaceAccount('rec-1', {
      ...account('Nubank'),
    });

    expect(corrected.cards[0]?.paymentAccountName).toBe('Nubank');
  });

  it('takes a corrected card and the account that pays it', () => {
    const corrected = settled()
      .addAccount(account('Nubank'))
      .replaceCard('rec-4', { ...card(), paymentAccountName: 'Nubank' });

    expect(corrected.cards).toHaveLength(1);
    expect(corrected.cards[0]?.paymentAccountName).toBe('Nubank');
  });

  it('refuses a card corrected onto an account nothing holds', () => {
    expect(() =>
      settled().replaceCard('rec-4', {
        ...card(),
        paymentAccountName: 'Nubank',
      }),
    ).toThrow(InvalidSetupRecord);
  });

  it('takes a corrected rule and keeps the funding order it had', () => {
    const corrected = settled().replaceOngoingBucket('rec-5', {
      ...ongoing(),
      rule: Allocation.fixed(Money.fromCents(177_800)),
    });

    expect(corrected.buckets[0]?.rule).toEqual(
      Allocation.fixed(Money.fromCents(177_800)),
    );
    expect(corrected.buckets[0]?.priority).toBe(1);
  });

  it('takes a corrected target on a goal', () => {
    const corrected = withAnchor()
      .addGoalBucket(goal())
      .replaceGoalBucket('rec-1', {
        ...goal(),
        target: {
          amount: Money.fromCents(20_000_000),
          date: LocalDate.parse('2032-03-31'),
        },
      });

    const [bucket] = corrected.buckets;

    expect(bucket?.mode === 'GOAL' ? bucket.target.amount.cents : 0).toBe(
      20_000_000,
    );
  });

  const unknown: readonly Attempt[] = [
    ['an account', () => settled().replaceAccount('rec-9', account())],
    ['a fixed bill', () => settled().replaceFixedBill('rec-9', bill())],
    [
      'a variable bill',
      () => settled().replaceVariableBill('rec-9', bill('Water', 12)),
    ],
    ['a card', () => settled().replaceCard('rec-9', card('Nu'))],
    [
      'an ongoing bucket',
      () => settled().replaceOngoingBucket('rec-9', ongoing('Reserve', 2)),
    ],
    [
      'a goal bucket',
      () => settled().replaceGoalBucket('rec-9', goal('Reserve', 2)),
    ],
    ['anything at all', () => settled().remove('rec-9')],
  ];

  it.each(unknown)(
    'refuses to correct %s it is not holding',
    (_name, build) => {
      expect(build).toThrow(SetupRecordNotFound);
    },
  );
});

describe('SetupDraft removals', () => {
  const drops: readonly [
    string,
    () => SetupDraft,
    string,
    (draft: SetupDraft) => number,
  ][] = [
    // The card is dropped first: an account paying one cannot be dropped.
    [
      'an account',
      () => settled().remove('rec-4'),
      'rec-1',
      (draft) => draft.accounts.length,
    ],
    ['a fixed bill', settled, 'rec-2', (draft) => draft.fixedBills.length],
    [
      'a variable bill',
      settled,
      'rec-3',
      (draft) => draft.variableBills.length,
    ],
    ['a card', settled, 'rec-4', (draft) => draft.cards.length],
    ['a bucket', settled, 'rec-5', (draft) => draft.buckets.length],
  ];

  it.each(drops)(
    'drops %s and nothing else with it',
    (_name, build, recordId, count) => {
      const before = build();
      const after = before.remove(recordId);

      expect(count(after)).toBe(count(before) - 1);
      expect(after.records).toHaveLength(before.records.length - 1);
      expect(after.find(recordId)).toBeUndefined();
    },
  );

  it('returns a new draft rather than changing the one it was given', () => {
    const before = settled();
    const after = before.remove('rec-2');

    expect(before.fixedBills).toHaveLength(1);
    expect(after).not.toBe(before);
  });

  /**
   * A card is paid from an account by name, so dropping the account under it
   * would leave the card naming nothing — and composition would quietly drop
   * the card rather than say so.
   */
  it('refuses to drop an account a card is paid from', () => {
    expect(() => settled().remove('rec-1')).toThrow(InvalidSetupRecord);
    expect(settled().accounts).toHaveLength(1);
  });

  /**
   * Skipping says the user has nothing in a section; dropping says one record
   * was wrong. The first settles the section, the second leaves it to ask
   * about again.
   */
  it('tells dropping the only bill apart from having none', () => {
    const dropped = withAnchor().addFixedBill(bill()).remove('rec-1');
    const skipped = withAnchor().skip(SetupSection.FixedBills);

    expect(dropped.fixedBills).toEqual([]);
    expect(skipped.fixedBills).toEqual([]);
    expect(dropped.remainingSections).toContain(SetupSection.FixedBills);
    expect(skipped.remainingSections).not.toContain(SetupSection.FixedBills);
  });
});
