import { describe, expect, it } from 'vitest';

import { noHolidays } from '../ports/holiday-calendar.js';
import { Money } from '../shared/money.js';
import { CycleRef, PaydayAnchor, ShiftPolicy } from './cycle-ref.js';
import { EntryKind } from './ledger-entry.js';
import {
  Direction,
  InvalidTemplate,
  RecurringTemplate,
  TemplateStatus,
} from './recurring-template.js';

const anchor = PaydayAnchor.of(5, ShiftPolicy.Preceding);
const cycle = (month: string) => CycleRef.forMonth(month, anchor, noHolidays);

const reais = (amount: number) => Money.fromCents(amount * 100);

const template = (
  overrides: Partial<Parameters<typeof RecurringTemplate.create>[0]> = {},
) =>
  RecurringTemplate.create({
    id: 'tpl-1',
    name: 'Health Plan',
    direction: Direction.Out,
    dueDayOfMonth: 8,
    amount: reais(-320),
    startMonth: '2026-08',
    ...overrides,
  });

describe('RecurringTemplate.create', () => {
  it('starts active and confirmed', () => {
    const created = template();

    expect(created.status).toBe(TemplateStatus.Active);
    expect(created.isEstimate).toBe(false);
    expect(created.hasValueSchedule).toBe(false);
  });

  it.each(['', '   '])('rejects a blank name (%s)', (name) => {
    expect(() => template({ name })).toThrow(InvalidTemplate);
  });

  it.each([0, 32, 5.5])('rejects a due day of %s', (dueDayOfMonth) => {
    expect(() => template({ dueDayOfMonth })).toThrow(InvalidTemplate);
  });

  it.each(['2026-13', 'August', '2026-8'])(
    'rejects the month %s',
    (startMonth) => {
      expect(() => template({ startMonth })).toThrow(InvalidTemplate);
    },
  );

  it('rejects an end before the start', () => {
    expect(() => template({ endMonth: '2026-07' })).toThrow(InvalidTemplate);
  });

  it('maps direction onto the entry kind the chain sums by', () => {
    expect(template({ direction: Direction.In }).entryKind).toBe(
      EntryKind.Income,
    );
    expect(template({ direction: Direction.Out }).entryKind).toBe(
      EntryKind.Fixed,
    );
  });
});

describe('RecurringTemplate.appliesTo', () => {
  it('generates from its start cycle onward', () => {
    const created = template({ startMonth: '2026-09' });

    expect(created.appliesTo(cycle('2026-08'))).toBe(false);
    expect(created.appliesTo(cycle('2026-09'))).toBe(true);
    expect(created.appliesTo(cycle('2026-10'))).toBe(true);
  });

  it('stops after its end cycle, inclusive of it', () => {
    const created = template({ endMonth: '2026-09' });

    expect(created.appliesTo(cycle('2026-09'))).toBe(true);
    expect(created.appliesTo(cycle('2026-10'))).toBe(false);
  });

  it('generates nothing while paused, and resumes where it left off', () => {
    const paused = template().pause();

    expect(paused.appliesTo(cycle('2026-08'))).toBe(false);
    expect(paused.resume().appliesTo(cycle('2026-08'))).toBe(true);
  });

  it('generates nothing once ended', () => {
    expect(template().markEnded().appliesTo(cycle('2026-08'))).toBe(false);
  });
});

describe('RecurringTemplate.amountFor', () => {
  // UC-2.3: salary is 10.000 through August and 18.000 from September. One
  // template with a step, not two templates and not twelve manual edits.
  const salary = () =>
    template({
      name: 'Salary',
      direction: Direction.In,
      amount: reais(10_000),
      valueSchedule: [{ fromMonth: '2026-09', amount: reais(18_000) }],
    });

  it('falls back to the base amount before the first step', () => {
    expect(salary().amountFor(cycle('2026-08')).cents).toBe(1_000_000);
  });

  it('takes the step from the cycle it starts at', () => {
    expect(salary().amountFor(cycle('2026-09')).cents).toBe(1_800_000);
  });

  it('keeps the step for every later cycle', () => {
    expect(salary().amountFor(cycle('2027-03')).cents).toBe(1_800_000);
  });

  // UC-2.4: the renovation climbs across four consecutive cycles.
  it('walks a multi-step schedule', () => {
    const renovation = template({
      name: 'Renovation Progress',
      amount: reais(-1_200),
      valueSchedule: [
        { fromMonth: '2026-10', amount: reais(-1_300) },
        { fromMonth: '2026-09', amount: reais(-1_250) },
        { fromMonth: '2026-11', amount: reais(-1_340) },
      ],
    });

    expect(renovation.amountFor(cycle('2026-08')).cents).toBe(-120_000);
    expect(renovation.amountFor(cycle('2026-09')).cents).toBe(-125_000);
    expect(renovation.amountFor(cycle('2026-10')).cents).toBe(-130_000);
    expect(renovation.amountFor(cycle('2026-12')).cents).toBe(-134_000);
  });

  it('sorts steps however they were supplied', () => {
    const created = template({
      valueSchedule: [
        { fromMonth: '2026-12', amount: reais(-500) },
        { fromMonth: '2026-09', amount: reais(-400) },
      ],
    });

    expect(created.valueSchedule.map((s) => s.fromMonth)).toEqual([
      '2026-09',
      '2026-12',
    ]);
  });
});

describe('RecurringTemplate.scheduleAmountFrom', () => {
  it('applies the new amount from that cycle onward, leaving earlier ones alone', () => {
    const raised = template({ amount: reais(-320) }).scheduleAmountFrom(
      '2026-10',
      reais(-400),
    );

    expect(raised.amountFor(cycle('2026-09')).cents).toBe(-32_000);
    expect(raised.amountFor(cycle('2026-10')).cents).toBe(-40_000);
  });

  it('replaces a step already starting at that cycle rather than stacking one', () => {
    const twice = template()
      .scheduleAmountFrom('2026-10', reais(-400))
      .scheduleAmountFrom('2026-10', reais(-450));

    expect(twice.valueSchedule).toHaveLength(1);
    expect(twice.amountFor(cycle('2026-10')).cents).toBe(-45_000);
  });

  it('rejects an unparsable cycle', () => {
    expect(() => template().scheduleAmountFrom('2026-13', reais(-1))).toThrow(
      InvalidTemplate,
    );
  });

  it('never mutates the template it changes', () => {
    const original = template();

    original.scheduleAmountFrom('2026-10', reais(-400));

    expect(original.hasValueSchedule).toBe(false);
  });
});

describe('RecurringTemplate.dueDateIn', () => {
  // The August cycle runs 5 Aug – 3 Sep, so it contains an 8th in August.
  it('places the due day inside the cycle', () => {
    expect(
      template({ dueDayOfMonth: 8 }).dueDateIn(cycle('2026-08'))?.toISO(),
    ).toBe('2026-08-08');
  });

  // A cycle spans two months, and only the later one holds a 3rd: the August
  // cycle's 3rd is 3 September.
  it('falls into the second month when the first has already passed it', () => {
    expect(
      template({ dueDayOfMonth: 3 }).dueDateIn(cycle('2026-08'))?.toISO(),
    ).toBe('2026-09-03');
  });

  it('clamps onto the last day of a short month', () => {
    // The February cycle runs 5 Feb – 4 Mar 2026; day 31 clamps to 28 Feb.
    expect(
      template({ dueDayOfMonth: 31 }).dueDateIn(cycle('2026-02'))?.toISO(),
    ).toBe('2026-02-28');
  });

  it('reports no date when the day falls in neither month of the cycle', () => {
    // The August cycle ends 3 Sep, and 4 Aug is before it opens.
    expect(
      template({ dueDayOfMonth: 4 }).dueDateIn(cycle('2026-08')),
    ).toBeUndefined();
  });
});

describe('RecurringTemplate lifecycle', () => {
  it('renames', () => {
    expect(template().rename('Health Insurance').name).toBe('Health Insurance');
  });

  it('rejects renaming to nothing', () => {
    expect(() => template().rename('  ')).toThrow(InvalidTemplate);
  });

  it('ends on a chosen cycle without deleting history', () => {
    const ending = template().endOn('2026-12');

    expect(ending.endMonth).toBe('2026-12');
    expect(ending.appliesTo(cycle('2026-12'))).toBe(true);
    expect(ending.appliesTo(cycle('2027-01'))).toBe(false);
  });

  it('rejects ending before it starts', () => {
    expect(() => template().endOn('2026-07')).toThrow(InvalidTemplate);
  });

  it.each([
    ['pausing', (t: RecurringTemplate) => t.pause()],
    ['resuming', (t: RecurringTemplate) => t.resume()],
  ])('refuses %s an ended template', (_name, act) => {
    expect(() => act(template().markEnded())).toThrow(InvalidTemplate);
  });

  it('flags an unconfirmed estimate', () => {
    expect(template().asEstimate(true).isEstimate).toBe(true);
  });
});
