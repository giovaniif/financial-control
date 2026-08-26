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
    startMonth: '2026-09',
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

  it.each(['2026-14', 'August', '2026-8'])(
    'rejects the month %s',
    (startMonth) => {
      expect(() => template({ startMonth })).toThrow(InvalidTemplate);
    },
  );

  it('rejects an end before the start', () => {
    expect(() => template({ endMonth: '2026-08' })).toThrow(InvalidTemplate);
  });

  it('maps direction onto the entry kind the chain sums by', () => {
    expect(template({ direction: Direction.In }).entryKind).toBe(
      EntryKind.Income,
    );
    expect(template({ direction: Direction.Out }).entryKind).toBe(
      EntryKind.Fixed,
    );
  });

  /**
   * The direction is what the user chose; the sign is bookkeeping. "320" and
   * "-320" are the same statement about a bill, so the aggregate settles it
   * rather than leaving each caller to remember — a positive OUT would reach
   * the chain as a FIXED entry that *adds* money.
   */
  describe('the sign follows the direction', () => {
    it.each([
      ['an outgoing amount typed as positive', Direction.Out, 320, -32_000],
      ['an outgoing amount already negative', Direction.Out, -320, -32_000],
      ['income typed as negative', Direction.In, -18_000, 1_800_000],
      ['income already positive', Direction.In, 18_000, 1_800_000],
    ])('normalises %s', (_name, direction, given, expected) => {
      expect(
        template({ direction, amount: reais(given) }).amountFor(
          cycle('2026-09'),
        ).cents,
      ).toBe(expected);
    });

    it.each([
      ['outgoing', Direction.Out, 250, -25_000],
      ['income', Direction.In, -250, 25_000],
    ])(
      'normalises a %s schedule step too',
      (_name, direction, given, expected) => {
        const scheduled = template({ direction }).scheduleAmountFrom(
          '2026-10',
          reais(given),
        );

        expect(scheduled.amountFor(cycle('2026-10')).cents).toBe(expected);
      },
    );
  });
});

describe('RecurringTemplate.appliesTo', () => {
  it('generates from its start cycle onward', () => {
    const created = template({ startMonth: '2026-10' });

    expect(created.appliesTo(cycle('2026-09'))).toBe(false);
    expect(created.appliesTo(cycle('2026-10'))).toBe(true);
    expect(created.appliesTo(cycle('2026-11'))).toBe(true);
  });

  it('stops after its end cycle, inclusive of it', () => {
    const created = template({ endMonth: '2026-10' });

    expect(created.appliesTo(cycle('2026-10'))).toBe(true);
    expect(created.appliesTo(cycle('2026-11'))).toBe(false);
  });

  it('generates nothing while paused, and resumes where it left off', () => {
    const paused = template().pause();

    expect(paused.appliesTo(cycle('2026-09'))).toBe(false);
    expect(paused.resume().appliesTo(cycle('2026-09'))).toBe(true);
  });

  it('generates nothing once ended', () => {
    expect(template().markEnded().appliesTo(cycle('2026-09'))).toBe(false);
  });
});

describe('RecurringTemplate.amountFor', () => {
  // UC-2.3: salary is 10.000 through September and 18.000 from October. One
  // template with a step, not two templates and not twelve manual edits.
  const salary = () =>
    template({
      name: 'Salary',
      direction: Direction.In,
      amount: reais(10_000),
      valueSchedule: [{ fromMonth: '2026-10', amount: reais(18_000) }],
    });

  it('falls back to the base amount before the first step', () => {
    expect(salary().amountFor(cycle('2026-09')).cents).toBe(1_000_000);
  });

  it('takes the step from the cycle it starts at', () => {
    expect(salary().amountFor(cycle('2026-10')).cents).toBe(1_800_000);
  });

  it('keeps the step for every later cycle', () => {
    expect(salary().amountFor(cycle('2027-04')).cents).toBe(1_800_000);
  });

  // UC-2.4: the renovation climbs across four consecutive cycles.
  it('walks a multi-step schedule', () => {
    const renovation = template({
      name: 'Renovation Progress',
      amount: reais(-1_200),
      valueSchedule: [
        { fromMonth: '2026-11', amount: reais(-1_300) },
        { fromMonth: '2026-10', amount: reais(-1_250) },
        { fromMonth: '2026-12', amount: reais(-1_340) },
      ],
    });

    expect(renovation.amountFor(cycle('2026-09')).cents).toBe(-120_000);
    expect(renovation.amountFor(cycle('2026-10')).cents).toBe(-125_000);
    expect(renovation.amountFor(cycle('2026-11')).cents).toBe(-130_000);
    expect(renovation.amountFor(cycle('2027-01')).cents).toBe(-134_000);
  });

  it('sorts steps however they were supplied', () => {
    const created = template({
      valueSchedule: [
        { fromMonth: '2027-01', amount: reais(-500) },
        { fromMonth: '2026-10', amount: reais(-400) },
      ],
    });

    expect(created.valueSchedule.map((s) => s.fromMonth)).toEqual([
      '2026-10',
      '2027-01',
    ]);
  });
});

/**
 * UC-2.3 — changing an amount "this cycle and all future" is the ordinary way
 * to correct a bill, and it must not leave the template looking like UC-2.4's
 * genuinely stepped one.
 */
describe('RecurringTemplate.scheduleAmountFrom — only a real step is a step', () => {
  /**
   * A step at or before the start wins in every cycle the template can
   * produce, because resolution scans for the latest step at or before a
   * cycle. It is the base amount written somewhere the user then gets a badge
   * about.
   */
  it.each(['2026-09', '2026-08'])(
    'sets the base amount when the change starts at or before the start (%s)',
    (fromMonth) => {
      const changed = template().scheduleAmountFrom(fromMonth, reais(-400));

      expect(changed.hasValueSchedule).toBe(false);
      expect(changed.amountFor(cycle('2026-09')).cents).toBe(-40_000);
      expect(changed.amountFor(cycle('2027-05')).cents).toBe(-40_000);
    },
  );

  /** A change that starts later is a real step — UC-2.4 working as intended. */
  it('keeps a step when the change starts after the template does', () => {
    const changed = template().scheduleAmountFrom('2026-11', reais(-400));

    expect(changed.hasValueSchedule).toBe(true);
    expect(changed.amountFor(cycle('2026-09')).cents).toBe(-32_000);
    expect(changed.amountFor(cycle('2026-11')).cents).toBe(-40_000);
  });
});

describe('RecurringTemplate.scheduleAmountFrom', () => {
  it('applies the new amount from that cycle onward, leaving earlier ones alone', () => {
    const raised = template({ amount: reais(-320) }).scheduleAmountFrom(
      '2026-11',
      reais(-400),
    );

    expect(raised.amountFor(cycle('2026-10')).cents).toBe(-32_000);
    expect(raised.amountFor(cycle('2026-11')).cents).toBe(-40_000);
  });

  it('replaces a step already starting at that cycle rather than stacking one', () => {
    const twice = template()
      .scheduleAmountFrom('2026-11', reais(-400))
      .scheduleAmountFrom('2026-11', reais(-450));

    expect(twice.valueSchedule).toHaveLength(1);
    expect(twice.amountFor(cycle('2026-11')).cents).toBe(-45_000);
  });

  it('rejects an unparsable cycle', () => {
    expect(() => template().scheduleAmountFrom('2026-14', reais(-1))).toThrow(
      InvalidTemplate,
    );
  });

  it('never mutates the template it changes', () => {
    const original = template();

    original.scheduleAmountFrom('2026-11', reais(-400));

    expect(original.hasValueSchedule).toBe(false);
  });
});

describe('RecurringTemplate.dueDateIn', () => {
  // The September cycle runs 5 Aug – 3 Sep, so it contains an 8th in August.
  it('places the due day inside the cycle', () => {
    expect(
      template({ dueDayOfMonth: 8 }).dueDateIn(cycle('2026-09'))?.toISO(),
    ).toBe('2026-08-08');
  });

  // A cycle spans two months, and only the later one holds a 3rd: the
  // September cycle's 3rd is 3 September.
  it('falls into the second month when the first has already passed it', () => {
    expect(
      template({ dueDayOfMonth: 3 }).dueDateIn(cycle('2026-09'))?.toISO(),
    ).toBe('2026-09-03');
  });

  it('clamps onto the last day of a short month', () => {
    // The March cycle runs 5 Feb – 4 Mar 2026; day 31 clamps to 28 Feb.
    expect(
      template({ dueDayOfMonth: 31 }).dueDateIn(cycle('2026-03'))?.toISO(),
    ).toBe('2026-02-28');
  });

  it('reports no date when the day falls in neither month of the cycle', () => {
    // The September cycle ends 3 Sep, and 4 Aug is before it opens.
    expect(
      template({ dueDayOfMonth: 4 }).dueDateIn(cycle('2026-09')),
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
    const ending = template().endOn('2027-01');

    expect(ending.endMonth).toBe('2027-01');
    expect(ending.appliesTo(cycle('2027-01'))).toBe(true);
    expect(ending.appliesTo(cycle('2027-02'))).toBe(false);
  });

  it('rejects ending before it starts', () => {
    expect(() => template().endOn('2026-08')).toThrow(InvalidTemplate);
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
