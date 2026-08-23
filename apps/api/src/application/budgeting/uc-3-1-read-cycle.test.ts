import { describe, expect, it } from 'vitest';

import {
  CycleRef,
  PaydayAnchor,
  ShiftPolicy,
} from '../../domain/budgeting/cycle-ref.js';
import { Cycle, Estimates } from '../../domain/budgeting/cycle.js';
import { EntryKind, LedgerEntry } from '../../domain/budgeting/ledger-entry.js';
import {
  Direction,
  RecurringTemplate,
} from '../../domain/budgeting/recurring-template.js';
import { noHolidays } from '../../domain/ports/holiday-calendar.js';
import { LocalDate } from '../../domain/shared/local-date.js';
import { Money } from '../../domain/shared/money.js';
import { SettlementStatus } from '../../domain/shared/planned-actual.js';
import {
  InMemoryCycleRepository,
  InMemorySettingsRepository,
  InMemoryTemplateRepository,
} from '../testing/fakes.js';
import { ReadCycle, UnknownMonth } from './uc-3-1-read-cycle.js';

const anchor = PaydayAnchor.of(5, ShiftPolicy.Preceding);
const august = CycleRef.forMonth('2026-09', anchor, noHolidays);

const entry = (
  id: string,
  kind: EntryKind,
  due: string,
  reais: number,
  isEstimate = false,
) =>
  LedgerEntry.create({
    id,
    description: id,
    kind,
    dueDate: LocalDate.parse(due),
    planned: Money.fromCents(reais * 100),
    isEstimate,
  });

const populated = () =>
  Cycle.open({
    id: 'cycle-sep',
    ref: august,
    openingBalance: Money.fromCents(216_000),
    entries: [
      entry('Salary', EntryKind.Income, '2026-08-05', 18_000),
      entry('Rent', EntryKind.Fixed, '2026-08-10', -7_610),
      entry('Contractor Costs', EntryKind.Fixed, '2026-08-25', -1_500, true),
    ],
  });

const reading = (...cycles: Cycle[]) =>
  new ReadCycle(
    new InMemoryCycleRepository(cycles),
    new InMemorySettingsRepository(anchor),
    noHolidays,
    new InMemoryTemplateRepository(),
  );

describe('ReadCycle.byMonth', () => {
  it('reports the chain and the entries in due-date order', async () => {
    const view = await reading(populated()).byMonth('2026-09');

    expect(view.entries.map((e) => e.description)).toEqual([
      'Salary',
      'Rent',
      'Contractor Costs',
    ]);
    expect(view.chain.netSurplus.cents).toBe(889_000);
  });

  it('carries the balance standing after each entry', async () => {
    const view = await reading(populated()).byMonth('2026-09');

    expect(view.entries.map((e) => e.balanceCents)).toEqual([
      2_016_000, 1_255_000, 1_105_000,
    ]);
  });

  it('states the cycle bounds, never a bare month name', async () => {
    const view = await reading(populated()).byMonth('2026-09');

    expect(view.label).toBe('Setembro de 2026');
    expect(view.start).toBe('2026-08-05');
    expect(view.end).toBe('2026-09-03');
  });

  it('leaves the unconfirmed estimate out when asked for confirmed figures', async () => {
    const view = await reading(populated()).byMonth(
      '2026-09',
      Estimates.Excluded,
    );

    expect(view.entries).toHaveLength(2);
    expect(view.chain.netSurplus.cents).toBe(1_039_000);
  });

  it('reports the low-water mark and what caused it', async () => {
    const dipping = Cycle.open({
      id: 'c',
      ref: august,
      openingBalance: Money.fromCents(50_000),
      entries: [
        entry('Big invoice', EntryKind.Invoice, '2026-08-10', -12_000),
        entry('Salary', EntryKind.Income, '2026-08-25', 18_000),
      ],
    });

    const view = await reading(dipping).byMonth('2026-09');

    expect(view.lowWaterMark?.balanceCents).toBe(-1_150_000);
    expect(view.lowWaterMark?.description).toBe('Big invoice');
    expect(view.firstNegativeDate).toBe('2026-08-10');
  });

  it('reports no negative date when the balance never crosses zero', async () => {
    const view = await reading(populated()).byMonth('2026-09');

    expect(view.firstNegativeDate).toBeUndefined();
  });

  it('carries the settled amount and its variance', async () => {
    const settled = populated().settleEntry(
      'Rent',
      Money.fromCents(-780_000),
      SettlementStatus.Paid,
    );

    const view = await reading(settled).byMonth('2026-09');
    const rent = view.entries.find((e) => e.description === 'Rent');

    expect(rent?.actualCents).toBe(-780_000);
    expect(rent?.varianceCents).toBe(-19_000);
  });

  it('marks an overridden entry as such', async () => {
    const overridden = populated().overrideEntry(
      'Rent',
      Money.fromCents(-800_000),
    );

    const view = await reading(overridden).byMonth('2026-09');

    expect(
      view.entries.find((e) => e.description === 'Rent')?.isOverridden,
    ).toBe(true);
  });

  // The month exists; nothing has been put in it yet.
  it('reads a month never materialised as an empty cycle', async () => {
    const view = await reading().byMonth('2026-12');

    expect(view.entries).toEqual([]);
    expect(view.chain.closingBalance.isZero()).toBe(true);
    expect(view.lowWaterMark).toBeUndefined();
  });

  it.each(['August-2026', '2026-14', ''])(
    'refuses the unparsable month %s',
    async (month) => {
      await expect(reading().byMonth(month)).rejects.toThrow(UnknownMonth);
    },
  );
});

describe('ReadCycle.refFor', () => {
  it('resolves a month against the configured anchor', async () => {
    const ref = await reading().refFor('2026-09');

    expect(ref.start.toISO()).toBe('2026-08-05');
  });
});

describe('ReadCycle materialises the cycle from templates', () => {
  const readingWith = (
    templates: RecurringTemplate[],
    cycles: Cycle[] = [],
  ) => {
    const cycleRepo = new InMemoryCycleRepository(cycles);

    return {
      cycleRepo,
      useCase: new ReadCycle(
        cycleRepo,
        new InMemorySettingsRepository(anchor),
        noHolidays,
        new InMemoryTemplateRepository(templates),
      ),
    };
  };

  const salary = RecurringTemplate.create({
    id: 'tpl-salary',
    name: 'Salary',
    direction: Direction.In,
    dueDayOfMonth: 5,
    amount: Money.fromCents(1_800_000),
    startMonth: '2026-09',
  });
  const health = RecurringTemplate.create({
    id: 'tpl-health',
    name: 'Health Plan',
    direction: Direction.Out,
    dueDayOfMonth: 8,
    amount: Money.fromCents(-32_000),
    startMonth: '2026-09',
  });

  // Until this worked, every cycle was permanently empty.
  it('fills an untouched month from the templates that apply to it', async () => {
    const { useCase } = readingWith([salary, health]);

    const view = await useCase.byMonth('2026-09');

    expect(view.entries.map((e) => e.description)).toEqual([
      'Salary',
      'Health Plan',
    ]);
    expect(view.chain.netSurplus.cents).toBe(1_768_000);
  });

  it('persists what it generated, so the entries have stable ids', async () => {
    const { useCase, cycleRepo } = readingWith([salary]);

    const first = await useCase.byMonth('2026-09');
    const second = await useCase.byMonth('2026-09');

    expect(cycleRepo.saved).toHaveLength(1);
    expect(second.entries[0]?.id).toBe(first.entries[0]?.id);
  });

  it('does not write when there was nothing to generate', async () => {
    const { useCase, cycleRepo } = readingWith([]);

    await useCase.byMonth('2026-09');

    expect(cycleRepo.saved).toHaveLength(0);
  });

  it('applies the value schedule for the cycle it is reading', async () => {
    const stepped = RecurringTemplate.create({
      id: 'tpl-salary',
      name: 'Salary',
      direction: Direction.In,
      dueDayOfMonth: 5,
      amount: Money.fromCents(1_000_000),
      startMonth: '2026-09',
      valueSchedule: [
        { fromMonth: '2026-10', amount: Money.fromCents(1_800_000) },
      ],
    });
    const { useCase } = readingWith([stepped]);

    expect((await useCase.byMonth('2026-09')).chain.totalIncome.cents).toBe(
      1_000_000,
    );
    expect((await useCase.byMonth('2026-10')).chain.totalIncome.cents).toBe(
      1_800_000,
    );
  });

  it('leaves a settled entry alone on the next read', async () => {
    const { useCase, cycleRepo } = readingWith([health]);

    const first = await useCase.byMonth('2026-09');
    const stored = await cycleRepo.findByMonth(august);
    if (stored === undefined) {
      throw new Error('expected the read to have persisted the cycle');
    }
    await cycleRepo.save(
      stored.settleEntry(
        first.entries[0]?.id ?? '',
        Money.fromCents(-33_000),
        SettlementStatus.Paid,
      ),
    );

    const again = await useCase.byMonth('2026-09');

    expect(again.entries).toHaveLength(1);
    expect(again.entries[0]?.actualCents).toBe(-33_000);
  });
});
