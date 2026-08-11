import { describe, expect, it } from 'vitest';

import {
  CycleRef,
  PaydayAnchor,
  ShiftPolicy,
} from '../../domain/budgeting/cycle-ref.js';
import { Cycle } from '../../domain/budgeting/cycle.js';
import { EntryKind, LedgerEntry } from '../../domain/budgeting/ledger-entry.js';
import { Allocation, Bucket } from '../../domain/goals/bucket.js';
import { noHolidays } from '../../domain/ports/holiday-calendar.js';
import { LocalDate } from '../../domain/shared/local-date.js';
import { Money } from '../../domain/shared/money.js';
import { Percentage } from '../../domain/shared/percentage.js';
import { SettlementStatus } from '../../domain/shared/planned-actual.js';
import {
  InMemoryBucketRepository,
  InMemoryCycleRepository,
  InMemorySettingsRepository,
} from '../testing/fakes.js';
import { FixedClock } from '../testing/fixed-clock.js';
import { BuildDashboard } from './uc-4-build-dashboard.js';

const anchor = PaydayAnchor.of(5, ShiftPolicy.Preceding);
const ref = (month: string) => CycleRef.forMonth(month, anchor, noHolidays);
const reais = (amount: number) => Money.fromCents(Math.round(amount * 100));

/** 10 Aug: inside the August cycle, which runs 5 Aug – 3 Sep. */
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
const september = () =>
  Cycle.open({
    id: '2026-09',
    ref: ref('2026-09'),
    openingBalance: Money.zero(),
    entries: [
      entry('Salary', EntryKind.Income, '2026-09-04', 18_000),
      entry('Rent', EntryKind.Fixed, '2026-09-10', -7_610),
      entry('Contractor Costs', EntryKind.Fixed, '2026-09-25', -1_500, true),
      entry('→ Reserve', EntryKind.Allocation, '2026-09-28', -5_334),
    ],
  });

const building = (options: { cycles?: Cycle[]; buckets?: Bucket[] } = {}) =>
  new BuildDashboard(
    new InMemoryCycleRepository(options.cycles ?? []),
    new InMemoryBucketRepository(options.buckets ?? []),
    new InMemorySettingsRepository(anchor),
    noHolidays,
    clock,
  );

describe('BuildDashboard headline — the answer to Q1', () => {
  // The Dashboard opens on the current cycle but speaks about the next: the
  // question is always asked from the middle of the one you are in.
  it('speaks about the next cycle, not the current one', async () => {
    const view = await building({ cycles: [september()] }).build();

    expect(view.currentCycleMonth).toBe('2026-08');
    expect(view.headline.cycleMonth).toBe('2026-09');
    expect(view.headline.cycleLabel).toBe('September 2026');
  });

  it('reports what arrives, what goes out and what stays free', async () => {
    const { headline } = await building({ cycles: [september()] }).build();

    expect(headline.incomingCents).toBe(1_800_000);
    expect(headline.outgoingCents).toBe(911_000);
    expect(headline.freeCents).toBe(355_600);
  });

  it('reports the closing balance both with and without the estimate', async () => {
    const { headline } = await building({ cycles: [september()] }).build();

    expect(headline.closingCents).toBe(355_600);
    expect(headline.closingWithoutEstimatesCents).toBe(505_600);
  });

  it('reports the lowest point and the date it happens', async () => {
    const { headline } = await building({ cycles: [september()] }).build();

    expect(headline.lowestPointCents).toBe(355_600);
    expect(headline.lowestPointDate).toBe('2026-09-28');
  });

  it('answers with zeroes for a cycle nobody has touched', async () => {
    const { headline } = await building().build();

    expect(headline.incomingCents).toBe(0);
    expect(headline.lowestPointDate).toBeUndefined();
  });
});

describe('BuildDashboard KPIs', () => {
  it('reports the four figures in the order the chain runs', async () => {
    const { kpis } = await building({ cycles: [september()] }).build();

    expect(kpis.map((k) => k.label)).toEqual([
      'Total Outcome',
      'Expected Surplus',
      'Net Surplus',
      'Lowest point in cycle',
    ]);
    expect(kpis[1]?.amountCents).toBe(889_000);
  });
});

describe('BuildDashboard cycle progress', () => {
  it('reports how far through the cycle today is', async () => {
    const august = Cycle.open({
      id: '2026-08',
      ref: ref('2026-08'),
      openingBalance: Money.zero(),
      entries: [entry('Rent', EntryKind.Fixed, '2026-08-10', -1_000)],
    });

    const { progress } = await building({ cycles: [august] }).build();

    // 5 Aug – 3 Sep is 30 days, and today is the 6th day.
    expect(progress.cycleLength).toBe(30);
    expect(progress.dayOfCycle).toBe(6);
    expect(progress.timePercent).toBe(20);
  });

  // The gap between time and spend is the signal.
  it('reports spend against what was planned', async () => {
    const august = Cycle.open({
      id: '2026-08',
      ref: ref('2026-08'),
      openingBalance: Money.zero(),
      entries: [
        entry('Rent', EntryKind.Fixed, '2026-08-10', -1_000),
        entry('Power', EntryKind.Fixed, '2026-08-15', -1_000),
      ],
    }).settleEntry('Rent', reais(-1_000), SettlementStatus.Paid);

    const { progress } = await building({ cycles: [august] }).build();

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
    const { upcoming } = await building({ cycles: [september()] }).build();

    expect(upcoming.map((u) => u.description)).toEqual([
      'Salary',
      'Rent',
      'Contractor Costs',
      '→ Reserve',
    ]);
  });

  it('puts an overdue entry first and says how late it is', async () => {
    const august = Cycle.open({
      id: '2026-08',
      ref: ref('2026-08'),
      openingBalance: Money.zero(),
      entries: [
        entry('Late bill', EntryKind.Fixed, '2026-08-06', -500),
        entry('Later bill', EntryKind.Fixed, '2026-08-20', -500),
      ],
    });

    const { upcoming } = await building({ cycles: [august] }).build();

    expect(upcoming[0]?.description).toBe('Late bill');
    expect(upcoming[0]?.isOverdue).toBe(true);
    expect(upcoming[0]?.daysLate).toBe(4);
  });

  it('leaves settled entries out', async () => {
    const settled = september().skipEntry('Rent');

    const { upcoming } = await building({ cycles: [settled] }).build();

    expect(upcoming.map((u) => u.description)).not.toContain('Rent');
  });
});

describe('BuildDashboard alerts', () => {
  // The top alert in UC-4.7, and the reason the window opens one cycle back:
  // a window starting at today could never reach a cycle old enough to raise it.
  it('flags a past cycle that cannot be closed, naming what is in the way', async () => {
    const july = Cycle.open({
      id: '2026-07',
      ref: ref('2026-07'),
      openingBalance: Money.zero(),
      entries: [
        entry('Renovation Progress', EntryKind.Fixed, '2026-07-20', -2_350),
      ],
    });

    const { alerts } = await building({ cycles: [july] }).build();
    const alert = alerts.find((a) => a.title.includes('unsettled'));

    expect(alert?.severity).toBe('CRITICAL');
    expect(alert?.title).toContain('July 2026');
    expect(alert?.body).toContain('Renovation Progress');
  });

  it('says nothing about a past cycle whose entries are all settled', async () => {
    const july = Cycle.open({
      id: '2026-07',
      ref: ref('2026-07'),
      openingBalance: Money.zero(),
      entries: [entry('Paid up', EntryKind.Fixed, '2026-07-20', -500)],
    }).skipEntry('Paid up');

    const { alerts } = await building({ cycles: [july] }).build();

    expect(alerts.some((a) => a.title.includes('unsettled'))).toBe(false);
  });

  it('names only the first few when many are unsettled', async () => {
    const july = Cycle.open({
      id: '2026-07',
      ref: ref('2026-07'),
      openingBalance: Money.zero(),
      entries: [
        entry('One', EntryKind.Fixed, '2026-07-10', -100),
        entry('Two', EntryKind.Fixed, '2026-07-11', -100),
        entry('Three', EntryKind.Fixed, '2026-07-12', -100),
        entry('Four', EntryKind.Fixed, '2026-07-13', -100),
      ],
    });

    const { alerts } = await building({ cycles: [july] }).build();
    const alert = alerts.find((a) => a.title.includes('unsettled'));

    expect(alert?.body).toContain('and 1 more');
  });

  it('leaves a past cycle out of the upcoming list', async () => {
    const july = Cycle.open({
      id: '2026-07',
      ref: ref('2026-07'),
      openingBalance: Money.zero(),
      entries: [entry('Old', EntryKind.Fixed, '2026-07-20', -500)],
    });

    const { upcoming } = await building({ cycles: [july] }).build();

    expect(upcoming).toEqual([]);
  });

  it('flags a projected negative balance with the entry that caused it', async () => {
    const broke = Cycle.open({
      id: '2026-09',
      ref: ref('2026-09'),
      openingBalance: Money.zero(),
      entries: [entry('Huge bill', EntryKind.Fixed, '2026-09-10', -5_000)],
    });

    const { alerts } = await building({ cycles: [broke] }).build();
    const alert = alerts.find((a) => a.title.includes('negative'));

    expect(alert?.severity).toBe('CRITICAL');
    expect(alert?.body).toContain('Huge bill');
  });

  it('quantifies an unconfirmed estimate both ways', async () => {
    const { alerts } = await building({ cycles: [september()] }).build();
    const alert = alerts.find((a) => a.title.includes('estimate'));

    expect(alert?.severity).toBe('WARNING');
    expect(alert?.body).toContain('with the estimate');
  });

  it('flags a goal whose target date has passed unmet', async () => {
    const behind = Bucket.goal({
      id: 'trip',
      name: 'Travel Fund',
      target: { amount: reais(5_000), date: LocalDate.parse('2026-06-30') },
      rule: Allocation.percentOfExpectedSurplus(Percentage.ofPercent(10)),
      priority: 1,
    });

    const { alerts } = await building({ buckets: [behind] }).build();

    expect(alerts.some((a) => a.title.includes('behind its target'))).toBe(
      true,
    );
  });

  // An ongoing bucket has no target date, so it can never be "behind" one.
  it('says nothing about an ongoing bucket', async () => {
    const ongoing = Bucket.ongoing({
      id: 'investments',
      name: 'Investments',
      rule: Allocation.percentOfExpectedSurplus(Percentage.ofPercent(10)),
      priority: 1,
    });

    const { alerts } = await building({ buckets: [ongoing] }).build();

    expect(alerts).toEqual([]);
  });

  it('says nothing about an archived bucket, however far behind', async () => {
    const archived = Bucket.goal({
      id: 'trip',
      name: 'Travel Fund',
      target: { amount: reais(5_000), date: LocalDate.parse('2026-06-30') },
      rule: Allocation.fixed(reais(1)),
      priority: 1,
    }).archive();

    const { alerts } = await building({ buckets: [archived] }).build();

    expect(alerts).toEqual([]);
  });

  it('says nothing about a goal that was met', async () => {
    const met = Bucket.goal({
      id: 'trip',
      name: 'Travel Fund',
      target: { amount: reais(100), date: LocalDate.parse('2026-06-30') },
      rule: Allocation.fixed(reais(1)),
      priority: 1,
    }).contribute('e1', '2026-05', reais(200));

    const { alerts } = await building({ buckets: [met] }).build();

    expect(alerts).toHaveLength(0);
  });

  it('ranks critical alerts above warnings', async () => {
    const broke = Cycle.open({
      id: '2026-09',
      ref: ref('2026-09'),
      openingBalance: Money.zero(),
      entries: [
        entry('Huge bill', EntryKind.Fixed, '2026-09-10', -5_000),
        entry('Guess', EntryKind.Fixed, '2026-09-25', -100, true),
      ],
    });

    const { alerts } = await building({ cycles: [broke] }).build();

    expect(alerts[0]?.severity).toBe('CRITICAL');
  });

  it('reports nothing to worry about when nothing is wrong', async () => {
    const clean = Cycle.open({
      id: '2026-09',
      ref: ref('2026-09'),
      openingBalance: Money.zero(),
      entries: [entry('Salary', EntryKind.Income, '2026-09-04', 18_000)],
    });

    expect((await building({ cycles: [clean] }).build()).alerts).toEqual([]);
  });
});
