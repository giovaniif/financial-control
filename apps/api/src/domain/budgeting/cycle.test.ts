import { describe, expect, it } from 'vitest';

import { noHolidays } from '../ports/holiday-calendar.js';
import { LocalDate } from '../shared/local-date.js';
import { Money } from '../shared/money.js';
import { SettlementStatus } from '../shared/planned-actual.js';
import { CycleRef, PaydayAnchor, ShiftPolicy } from './cycle-ref.js';
import {
  Cycle,
  CycleClosed,
  CycleNotSettled,
  CycleStatus,
  EntryNotFound,
  EntryNotInCycle,
  Estimates,
} from './cycle.js';
import { EntryKind, LedgerEntry } from './ledger-entry.js';

const anchor = PaydayAnchor.of(5, ShiftPolicy.Preceding);
const august = CycleRef.forMonth('2026-08', anchor, noHolidays);

let nextId = 0;
const entry = (
  description: string,
  kind: EntryKind,
  dueDate: string,
  reais: number,
  isEstimate = false,
) =>
  LedgerEntry.create({
    id: `entry-${String(++nextId)}`,
    description,
    kind,
    dueDate: LocalDate.parse(dueDate),
    planned: Money.fromCents(Math.round(reais * 100)),
    isEstimate,
  });

/**
 * The worked example from USE_CASES §4 UC-4.2: R$ 18.000 in, R$ 9.110 out,
 * R$ 5.334 allocated, R$ 3.556 free — with an unconfirmed R$ 1.500 estimate
 * among the outgoings.
 */
const workedExample = () =>
  Cycle.open({
    id: 'cycle-2026-08',
    ref: august,
    openingBalance: Money.zero(),
    entries: [
      entry('Salary', EntryKind.Income, '2026-08-05', 18_000),
      entry('Health Plan', EntryKind.Fixed, '2026-08-08', -320),
      entry('Inter — invoice', EntryKind.Invoice, '2026-08-10', -3_400),
      entry('Nubank — invoice', EntryKind.Invoice, '2026-08-10', -1_250),
      entry('Down Payment', EntryKind.Fixed, '2026-08-12', -890),
      entry('Electricity', EntryKind.Fixed, '2026-08-15', -280),
      entry('Mobile Plan', EntryKind.Fixed, '2026-08-15', -150),
      entry('Gym', EntryKind.Fixed, '2026-08-18', -120),
      entry('Renovation Progress', EntryKind.Fixed, '2026-08-20', -1_200),
      entry('Contractor Costs', EntryKind.Fixed, '2026-08-25', -1_500, true),
      entry('→ Reserve', EntryKind.Allocation, '2026-08-28', -1_778),
      entry('→ Investments', EntryKind.Allocation, '2026-08-28', -889),
      entry('→ Retirement', EntryKind.Allocation, '2026-08-28', -889),
      entry('→ Apartment', EntryKind.Allocation, '2026-08-28', -1_778),
    ],
  });

const reais = (money: Money) => money.cents / 100;

describe('Cycle membership', () => {
  it('accepts an entry due inside its range', () => {
    const cycle = Cycle.open({
      id: 'c',
      ref: august,
      openingBalance: Money.zero(),
    }).addEntry(entry('Salary', EntryKind.Income, '2026-08-05', 18_000));

    expect(cycle.entries).toHaveLength(1);
  });

  it('rejects an entry due outside its range', () => {
    const cycle = Cycle.open({
      id: 'c',
      ref: august,
      openingBalance: Money.zero(),
    });

    expect(() =>
      cycle.addEntry(entry('Salary', EntryKind.Income, '2026-09-05', 18_000)),
    ).toThrow(EntryNotInCycle);
  });

  it('reads its entries in due-date order however they were added', () => {
    const cycle = Cycle.open({
      id: 'c',
      ref: august,
      openingBalance: Money.zero(),
      entries: [
        entry('Electricity', EntryKind.Fixed, '2026-08-15', -280),
        entry('Salary', EntryKind.Income, '2026-08-05', 18_000),
        entry('Health Plan', EntryKind.Fixed, '2026-08-08', -320),
      ],
    });

    expect(cycle.entries.map((e) => e.description)).toEqual([
      'Salary',
      'Health Plan',
      'Electricity',
    ]);
  });

  // Otherwise the running balance dips through a trough the day's own income
  // already covered, and the low-water mark reports a scare that never happened.
  it('lands income before outgoings that share a date', () => {
    const cycle = Cycle.open({
      id: 'c',
      ref: august,
      openingBalance: Money.zero(),
      entries: [
        entry('→ Reserve', EntryKind.Allocation, '2026-08-05', -1_778),
        entry('Rent', EntryKind.Fixed, '2026-08-05', -2_100),
        entry('Salary', EntryKind.Income, '2026-08-05', 18_000),
      ],
    });

    expect(cycle.entries.map((e) => e.description)).toEqual([
      'Salary',
      'Rent',
      '→ Reserve',
    ]);
  });
});

describe('the calculation chain', () => {
  it('computes the worked example including estimates', () => {
    const chain = workedExample().chain(Estimates.Included);

    expect(reais(chain.totalIncome)).toBe(18_000);
    expect(reais(chain.totalOutcome)).toBe(9_110);
    expect(reais(chain.surplus)).toBe(8_890);
    expect(reais(chain.expectedSurplus)).toBe(8_890);
    expect(reais(chain.allocations)).toBe(5_334);
    expect(reais(chain.netSurplus)).toBe(3_556);
  });

  it('computes the same cycle without the unconfirmed estimate', () => {
    const chain = workedExample().chain(Estimates.Excluded);

    expect(reais(chain.totalOutcome)).toBe(7_610);
    expect(reais(chain.netSurplus)).toBe(5_056);
  });

  it('adds incoming variables to Expected Surplus without touching Surplus', () => {
    const cycle = workedExample().addEntry(
      entry('Reimbursement', EntryKind.Variable, '2026-08-14', 420),
    );
    const chain = cycle.chain();

    expect(reais(chain.surplus)).toBe(8_890);
    expect(reais(chain.expectedSurplus)).toBe(9_310);
    expect(reais(chain.totalOutcome)).toBe(9_110);
  });

  it('counts an outgoing variable in Total Outcome and in Expected Surplus', () => {
    const cycle = workedExample().addEntry(
      entry('Shared dinner', EntryKind.Variable, '2026-08-22', -180),
    );
    const chain = cycle.chain();

    expect(reais(chain.totalOutcome)).toBe(9_290);
    expect(reais(chain.expectedSurplus)).toBe(8_710);
    expect(reais(chain.netSurplus)).toBe(3_376);
  });

  it('carries the closing balance from the opening balance', () => {
    const cycle = Cycle.open({
      id: 'c',
      ref: august,
      openingBalance: Money.fromCents(216_000),
      entries: [entry('Salary', EntryKind.Income, '2026-08-05', 18_000)],
    });

    expect(reais(cycle.closingBalance())).toBe(20_160);
  });

  it('is all zeroes for a cycle with nothing in it', () => {
    const chain = Cycle.open({
      id: 'c',
      ref: august,
      openingBalance: Money.zero(),
    }).chain();

    expect(reais(chain.netSurplus)).toBe(0);
    expect(reais(chain.closingBalance)).toBe(0);
  });

  it('uses the actual amount once an entry is settled', () => {
    const cycle = workedExample();
    const electricity = cycle.entries.find(
      (e) => e.description === 'Electricity',
    );
    const settled = cycle.settleEntry(
      electricity?.id ?? '',
      Money.fromCents(-32_016),
      SettlementStatus.Paid,
    );

    // R$ 280 planned, R$ 320,16 actual: R$ 40,16 more out than expected.
    expect(reais(settled.chain().totalOutcome)).toBe(9_150.16);
  });

  it('drops a skipped entry out of every total', () => {
    const cycle = workedExample();
    const gym = cycle.entries.find((e) => e.description === 'Gym');

    expect(reais(cycle.skipEntry(gym?.id ?? '').chain().totalOutcome)).toBe(
      8_990,
    );
  });
});

describe('the running balance', () => {
  it('shows the balance standing after every entry', () => {
    const rows = workedExample().runningBalance();

    expect(rows).toHaveLength(14);
    expect(reais(rows[0]?.balance ?? Money.zero())).toBe(18_000);
    expect(reais(rows[1]?.balance ?? Money.zero())).toBe(17_680);
    expect(reais(rows.at(-1)?.balance ?? Money.zero())).toBe(3_556);
  });

  it('ends exactly where the chain says the cycle closes', () => {
    const cycle = workedExample();

    expect(cycle.runningBalance().at(-1)?.balance.cents).toBe(
      cycle.closingBalance().cents,
    );
  });

  it('leaves the estimate out when asked for confirmed figures only', () => {
    const rows = workedExample().runningBalance(Estimates.Excluded);

    expect(rows).toHaveLength(13);
    expect(reais(rows.at(-1)?.balance ?? Money.zero())).toBe(5_056);
  });

  it('reports the lowest point and the entry that caused it', () => {
    const low = workedExample().lowWaterMark();

    expect(reais(low?.balance ?? Money.zero())).toBe(3_556);
    expect(low?.entry.description).toBe('→ Apartment');
  });

  // The case the whole feature exists for: a cycle that closes comfortably
  // positive can still run out of cash in the middle of the month.
  it('surfaces a dip that the closing balance hides', () => {
    const cycle = Cycle.open({
      id: 'c',
      ref: august,
      openingBalance: Money.fromCents(50_000),
      entries: [
        entry('Big invoice', EntryKind.Invoice, '2026-08-10', -12_000),
        entry('Salary', EntryKind.Income, '2026-08-25', 18_000),
      ],
    });

    expect(reais(cycle.closingBalance())).toBe(6_500);
    expect(reais(cycle.lowWaterMark()?.balance ?? Money.zero())).toBe(-11_500);
    expect(cycle.firstNegativeDate()?.toISO()).toBe('2026-08-10');
  });

  it('reports no negative date when the balance never crosses zero', () => {
    expect(workedExample().firstNegativeDate()).toBeUndefined();
  });

  it('has no low-water mark when there is nothing in the cycle', () => {
    const empty = Cycle.open({
      id: 'c',
      ref: august,
      openingBalance: Money.zero(),
    });

    expect(empty.lowWaterMark()).toBeUndefined();
  });
});

describe('closing a cycle', () => {
  const settleEverything = (cycle: Cycle): Cycle =>
    cycle.entries.reduce<Cycle>(
      (settled, current) => settled.skipEntry(current.id),
      cycle,
    );

  it('refuses to close while an entry is unsettled', () => {
    expect(() => workedExample().close()).toThrow(CycleNotSettled);
  });

  it('names how many entries are in the way', () => {
    expect(() => workedExample().close()).toThrow(/14 unsettled entries/);
  });

  it('closes once every entry is settled or skipped', () => {
    const closed = settleEverything(workedExample()).close();

    expect(closed.status).toBe(CycleStatus.Closed);
  });

  it.each([
    [
      'adding an entry',
      (c: Cycle) =>
        c.addEntry(entry('Late', EntryKind.Fixed, '2026-08-30', -50)),
    ],
    ['removing an entry', (c: Cycle) => c.removeEntry(c.entries[0]?.id ?? '')],
    ['skipping an entry', (c: Cycle) => c.skipEntry(c.entries[0]?.id ?? '')],
    [
      'overriding an entry',
      (c: Cycle) => c.overrideEntry(c.entries[0]?.id ?? '', Money.zero()),
    ],
    ['closing it again', (c: Cycle) => c.close()],
  ])('rejects %s once closed', (_name, mutate) => {
    const closed = settleEverything(workedExample()).close();

    expect(() => mutate(closed)).toThrow(CycleClosed);
  });

  it('still reports its chain after closing', () => {
    const closed = settleEverything(workedExample()).close();

    // Everything was skipped, so nothing was realised.
    expect(reais(closed.chain().netSurplus)).toBe(0);
  });

  it('reopens for correction', () => {
    const reopened = settleEverything(workedExample()).close().reopen();

    expect(reopened.status).toBe(CycleStatus.Open);
  });

  it('leaves an already-open cycle alone when reopened', () => {
    const open = workedExample();

    expect(open.reopen().status).toBe(CycleStatus.Open);
  });
});

describe('Cycle entry lookup', () => {
  it.each([
    [
      'settling',
      (c: Cycle) => c.settleEntry('nope', Money.zero(), SettlementStatus.Paid),
    ],
    ['skipping', (c: Cycle) => c.skipEntry('nope')],
    ['removing', (c: Cycle) => c.removeEntry('nope')],
  ])('rejects %s an entry that is not there', (_name, mutate) => {
    expect(() => mutate(workedExample())).toThrow(EntryNotFound);
  });

  it('removes an entry it does have', () => {
    const cycle = workedExample();
    const gym = cycle.entries.find((e) => e.description === 'Gym');

    expect(cycle.removeEntry(gym?.id ?? '').entries).toHaveLength(13);
  });

  it('never mutates the cycle it changes', () => {
    const cycle = workedExample();

    cycle.skipEntry(cycle.entries[0]?.id ?? '');

    expect(cycle.unsettledEntries).toHaveLength(14);
  });
});

describe('overriding an entry in one cycle only', () => {
  it('changes the figure and can be put back', () => {
    const cycle = workedExample();
    const renovation = cycle.entries.find(
      (e) => e.description === 'Renovation Progress',
    );
    const id = renovation?.id ?? '';

    const overridden = cycle.overrideEntry(id, Money.fromCents(-125_000));
    expect(reais(overridden.chain().totalOutcome)).toBe(9_160);

    const reverted = overridden.revertEntryOverride(id);
    expect(reais(reverted.chain().totalOutcome)).toBe(9_110);
  });
});

describe('Cycle identity and rehydration', () => {
  it('exposes the identity and opening balance it was opened with', () => {
    const cycle = Cycle.open({
      id: 'cycle-2026-08',
      ref: august,
      openingBalance: Money.fromCents(216_000),
    });

    expect(cycle.id).toBe('cycle-2026-08');
    expect(cycle.ref.month).toBe('2026-08');
    expect(reais(cycle.openingBalance)).toBe(2_160);
  });

  // Storage has already satisfied the invariants once; replaying them on every
  // read would reject a cycle whose anchor has since been reconfigured.
  it('rebuilds a closed cycle from storage without replaying its invariants', () => {
    const restored = Cycle.rehydrate({
      id: 'cycle-2026-08',
      ref: august,
      status: CycleStatus.Closed,
      openingBalance: Money.zero(),
      entries: [entry('Salary', EntryKind.Income, '2026-08-05', 18_000)],
    });

    expect(restored.isClosed).toBe(true);
    expect(reais(restored.chain().totalIncome)).toBe(18_000);
  });
});
