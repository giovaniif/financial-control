import { describe, expect, it } from 'vitest';

import {
  CycleRef,
  InvalidAnchor,
  PaydayAnchor,
  ShiftPolicy,
} from '../../domain/budgeting/cycle-ref.js';
import { Cycle, Estimates } from '../../domain/budgeting/cycle.js';
import { EntryKind, LedgerEntry } from '../../domain/budgeting/ledger-entry.js';
import { noHolidays } from '../../domain/ports/holiday-calendar.js';
import { LocalDate } from '../../domain/shared/local-date.js';
import { Money } from '../../domain/shared/money.js';
import { SettlementStatus } from '../../domain/shared/planned-actual.js';
import {
  InMemoryCycleRepository,
  InMemorySettingsRepository,
} from '../testing/fakes.js';
import { FixedClock } from '../testing/fixed-clock.js';
import { BuildDashboard } from './uc-4-build-dashboard.js';

const anchor = PaydayAnchor.of(5, ShiftPolicy.Preceding);
const ref = (month: string) => CycleRef.forMonth(month, anchor, noHolidays);
const reais = (amount: number) => Money.fromCents(Math.round(amount * 100));

/** 10 Aug: inside the September cycle, which runs 5 Aug – 3 Sep. */
const clock = FixedClock.at('2026-08-10T12:00:00Z');

const entry = (
  id: string,
  kind: EntryKind,
  due: string,
  amount: number,
  isEstimate = false,
) =>
  LedgerEntry.create({
    id,
    description: id,
    kind,
    dueDate: LocalDate.parse(due),
    planned: reais(amount),
    isEstimate,
  });

/** The September cycle from the worked example in USE_CASES §4. */
const october = () =>
  Cycle.open({
    id: '2026-10',
    ref: ref('2026-10'),
    openingBalance: Money.zero(),
    entries: [
      entry('Salary', EntryKind.Income, '2026-09-04', 18_000),
      entry('Rent', EntryKind.Fixed, '2026-09-10', -7_610),
      entry('Contractor Costs', EntryKind.Fixed, '2026-09-25', -1_500, true),
      entry('→ Reserve', EntryKind.Allocation, '2026-09-28', -5_334),
    ],
  });

const building = (options: { cycles?: Cycle[] } = {}) =>
  new BuildDashboard(
    new InMemoryCycleRepository(options.cycles ?? []),
    new InMemorySettingsRepository(anchor),
    noHolidays,
    clock,
  );

describe('BuildDashboard headline — the answer to Q1', () => {
  // The Dashboard opens on the current cycle but speaks about the next: the
  // question is always asked from the middle of the one you are in.
  it('speaks about the next cycle, not the current one', async () => {
    const view = await building({ cycles: [october()] }).build();

    expect(view.currentCycleMonth).toBe('2026-09');
    expect(view.headline.cycleMonth).toBe('2026-10');
    expect(view.headline.cycleLabel).toBe('Outubro de 2026');
  });
  it('reports what arrives, what goes out and what stays free', async () => {
    const { headline } = await building({ cycles: [october()] }).build();

    expect(headline.incomingCents).toBe(1_800_000);
    expect(headline.outgoingCents).toBe(911_000);
    expect(headline.freeCents).toBe(355_600);
  });

  it('reports the closing balance both with and without the estimate', async () => {
    const { headline } = await building({ cycles: [october()] }).build();

    expect(headline.closingCents).toBe(355_600);
    expect(headline.closingWithoutEstimatesCents).toBe(505_600);
  });
});

// UC-3.3: cycle navigation is global, so the Dashboard has to be able to
// describe a cycle other than the one after today's.
describe('BuildDashboard for a chosen cycle', () => {
  const september = () =>
    Cycle.open({
      id: '2026-09',
      ref: ref('2026-09'),
      openingBalance: Money.zero(),
      entries: [
        entry('Salary', EntryKind.Income, '2026-08-05', 10_000),
        entry('Rent', EntryKind.Fixed, '2026-08-10', -4_000),
      ],
    });

  it('describes the cycle it is asked for', async () => {
    const view = await building({ cycles: [september(), october()] }).build(
      '2026-09',
    );

    expect(view.headline.cycleMonth).toBe('2026-09');
    expect(view.headline.cycleLabel).toBe('Setembro de 2026');
    expect(view.headline.incomingCents).toBe(1_000_000);
    expect(view.headline.outgoingCents).toBe(400_000);
  });

  it('still reports which cycle is the current one', async () => {
    const view = await building({ cycles: [september()] }).build('2026-09');

    expect(view.currentCycleMonth).toBe('2026-09');
  });

  it('reads a cycle nobody has put anything in as empty, not as an error', async () => {
    const view = await building({ cycles: [october()] }).build('2027-03');

    expect(view.headline.cycleMonth).toBe('2027-03');
    expect(view.headline.incomingCents).toBe(0);
  });

  it('refuses a month it cannot parse', async () => {
    await expect(
      building({ cycles: [october()] }).build('nonsense'),
    ).rejects.toThrow(InvalidAnchor);
  });

  // The worklist is anchored to today, not to whatever is being looked at:
  // wandering back to a past cycle must not hide what is overdue now.
  it('keeps the upcoming list anchored to today', async () => {
    const chosen = await building({ cycles: [september(), october()] }).build(
      '2026-09',
    );
    const unchosen = await building({
      cycles: [september(), october()],
    }).build();

    expect(chosen.upcoming).toEqual(unchosen.upcoming);
  });
});

describe('BuildDashboard KPIs', () => {
  it('reports the chain figures in the order the chain runs', async () => {
    const { kpis } = await building({ cycles: [october()] }).build();

    expect(kpis.map((k) => k.label)).toEqual([
      'Total de saídas',
      'Sobra Esperada',
      'Sobra Líquida',
    ]);
    expect(kpis[1]?.amountCents).toBe(889_000);
  });
});

describe('BuildDashboard cycle progress', () => {
  it('reports how far through the cycle today is', async () => {
    const september = Cycle.open({
      id: '2026-09',
      ref: ref('2026-09'),
      openingBalance: Money.zero(),
      entries: [entry('Rent', EntryKind.Fixed, '2026-08-10', -1_000)],
    });

    const { progress } = await building({ cycles: [september] }).build();

    // 5 Aug – 3 Sep is 30 days, and today is the 6th day.
    expect(progress.cycleLength).toBe(30);
    expect(progress.dayOfCycle).toBe(6);
    expect(progress.timePercent).toBe(20);
  });

  // The gap between time and spend is the signal.
  it('reports spend against what was planned', async () => {
    const september = Cycle.open({
      id: '2026-09',
      ref: ref('2026-09'),
      openingBalance: Money.zero(),
      entries: [
        entry('Rent', EntryKind.Fixed, '2026-08-10', -1_000),
        entry('Power', EntryKind.Fixed, '2026-08-15', -1_000),
      ],
    }).settleEntry('Rent', reais(-1_000), SettlementStatus.Paid);

    const { progress } = await building({ cycles: [september] }).build();

    expect(progress.spentCents).toBe(100_000);
    expect(progress.plannedOutCents).toBe(200_000);
    expect(progress.spentPercent).toBe(50);
  });

  it('reports no spend for a cycle with nothing planned', async () => {
    const { progress } = await building().build();

    expect(progress.spentPercent).toBe(0);
  });
});

describe('BuildDashboard upcoming list', () => {
  it('lists what is unsettled, soonest first', async () => {
    const { upcoming } = await building({ cycles: [october()] }).build();

    expect(upcoming.map((u) => u.description)).toEqual([
      'Salary',
      'Rent',
      'Contractor Costs',
      '→ Reserve',
    ]);
  });

  it('puts an overdue entry first and says how late it is', async () => {
    const september = Cycle.open({
      id: '2026-09',
      ref: ref('2026-09'),
      openingBalance: Money.zero(),
      entries: [
        entry('Late bill', EntryKind.Fixed, '2026-08-06', -500),
        entry('Later bill', EntryKind.Fixed, '2026-08-20', -500),
      ],
    });

    const { upcoming } = await building({ cycles: [september] }).build();

    expect(upcoming[0]?.description).toBe('Late bill');
    expect(upcoming[0]?.isOverdue).toBe(true);
    expect(upcoming[0]?.daysLate).toBe(4);
  });

  it('leaves settled entries out', async () => {
    const settled = october().skipEntry('Rent');

    const { upcoming } = await building({ cycles: [settled] }).build();

    expect(upcoming.map((u) => u.description)).not.toContain('Rent');
  });
});

describe('BuildDashboard with estimates excluded', () => {
  const confirmed = () =>
    building({ cycles: [october()] }).build(undefined, Estimates.Excluded);

  it('says which reading it was built in', async () => {
    expect((await confirmed()).estimates).toBe(Estimates.Excluded);
    expect((await building({ cycles: [october()] }).build()).estimates).toBe(
      Estimates.Included,
    );
  });

  // The same figure, pinned both ways: Contractor Costs is the R$ 1.500
  // placeholder, and it is the whole of the difference.
  it('leaves the unconfirmed placeholder out of what goes out', async () => {
    const { headline } = await confirmed();

    expect(headline.outgoingCents).toBe(761_000);
    expect(headline.freeCents).toBe(505_600);
    expect(headline.closingCents).toBe(505_600);
  });

  /**
   * The third of UC-4.1's qualifying trio is the closing balance *without* the
   * estimates, and it stays that in both readings — in confirmed-only it
   * simply agrees with the closing balance beside it.
   */
  it('still reports the closing balance without estimates', async () => {
    const { headline } = await confirmed();

    expect(headline.closingWithoutEstimatesCents).toBe(505_600);
  });

  it('reports the KPI tiles in the same reading', async () => {
    const { kpis } = await confirmed();

    expect(kpis[0]?.amountCents).toBe(761_000);
    expect(kpis[1]?.amountCents).toBe(1_039_000);
  });

  // Progress describes the current cycle rather than the chosen one, so it
  // follows the toggle for the cycle it actually reports — which the view
  // names, so the two are never confused.
  it('measures spend against the planned outcome of the same reading', async () => {
    const september = Cycle.open({
      id: '2026-09',
      ref: ref('2026-09'),
      openingBalance: Money.zero(),
      entries: [
        entry('Rent', EntryKind.Fixed, '2026-08-10', -1_000),
        entry('Contractor Costs', EntryKind.Fixed, '2026-08-15', -1_000, true),
      ],
    });

    const included = await building({ cycles: [september] }).build();
    const excluded = await building({ cycles: [september] }).build(
      undefined,
      Estimates.Excluded,
    );

    expect(included.progress.plannedOutCents).toBe(200_000);
    expect(excluded.progress.plannedOutCents).toBe(100_000);
  });

  // The worklist counts the same entries the chain does, so a figure and the
  // list it is made of can never disagree.
  it('leaves an unconfirmed entry out of the upcoming list', async () => {
    const { upcoming } = await confirmed();

    expect(upcoming.map((u) => u.description)).toEqual([
      'Salary',
      'Rent',
      '→ Reserve',
    ]);
  });

  // A projected negative that only an estimate causes is not a confirmed
  // negative, so the alert follows the reading its figures were taken in.

  /**
   * The alert that exists to quantify an estimate is the one thing that must
   * not follow the toggle: it is what tells the user the two readings differ
   * at all, and it states both figures itself.
   */
});
