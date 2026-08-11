import { describe, expect, it } from 'vitest';

import { noHolidays } from '../ports/holiday-calendar.js';
import { Money } from '../shared/money.js';
import { SettlementStatus } from '../shared/planned-actual.js';
import { CycleRef, PaydayAnchor, ShiftPolicy } from './cycle-ref.js';
import { Cycle } from './cycle.js';
import { EntryKind } from './ledger-entry.js';
import { Direction, RecurringTemplate } from './recurring-template.js';
import { generateInto } from './template-generation.js';

const anchor = PaydayAnchor.of(5, ShiftPolicy.Preceding);
const august = CycleRef.forMonth('2026-08', anchor, noHolidays);
const reais = (amount: number) => Money.fromCents(amount * 100);

/** Deterministic and stable, exactly as the persistence key must be. */
const newId = (templateId: string, month: string) => `${templateId}@${month}`;

const template = (
  overrides: Partial<Parameters<typeof RecurringTemplate.create>[0]> = {},
) =>
  RecurringTemplate.create({
    id: 'tpl-health',
    name: 'Health Plan',
    direction: Direction.Out,
    dueDayOfMonth: 8,
    amount: reais(-320),
    startMonth: '2026-08',
    ...overrides,
  });

const emptyCycle = () =>
  Cycle.open({ id: 'cycle-aug', ref: august, openingBalance: Money.zero() });

describe('generateInto', () => {
  it('adds one entry per applicable template', () => {
    const result = generateInto(
      emptyCycle(),
      [
        template(),
        template({
          id: 'tpl-salary',
          name: 'Salary',
          direction: Direction.In,
          dueDayOfMonth: 5,
          amount: reais(18_000),
        }),
      ],
      newId,
    );

    expect(result.added).toHaveLength(2);
    expect(result.cycle.entries.map((e) => e.description)).toEqual([
      'Salary',
      'Health Plan',
    ]);
  });

  it('carries the template amount, kind and estimate flag onto the entry', () => {
    const result = generateInto(
      emptyCycle(),
      [template({ isEstimate: true })],
      newId,
    );
    const [entry] = result.added;

    expect(entry?.kind).toBe(EntryKind.Fixed);
    expect(entry?.amount.planned.cents).toBe(-32_000);
    expect(entry?.isEstimate).toBe(true);
    expect(entry?.dueDate.toISO()).toBe('2026-08-08');
  });

  it('records which template produced the entry', () => {
    const [entry] = generateInto(emptyCycle(), [template()], newId).added;

    expect(entry?.origin).toEqual({
      kind: 'FROM_TEMPLATE',
      templateId: 'tpl-health',
    });
  });

  it('takes the amount from the value schedule for that cycle', () => {
    const salary = template({
      id: 'tpl-salary',
      name: 'Salary',
      direction: Direction.In,
      dueDayOfMonth: 5,
      amount: reais(10_000),
      valueSchedule: [{ fromMonth: '2026-09', amount: reais(18_000) }],
    });

    const september = CycleRef.forMonth('2026-09', anchor, noHolidays);
    const inSeptember = generateInto(
      Cycle.open({ id: 'c', ref: september, openingBalance: Money.zero() }),
      [salary],
      newId,
    );

    expect(inSeptember.added[0]?.amount.planned.cents).toBe(1_800_000);
  });

  it('generates nothing before its start cycle', () => {
    const result = generateInto(
      emptyCycle(),
      [template({ startMonth: '2026-09' })],
      newId,
    );

    expect(result.added).toHaveLength(0);
  });

  it('generates nothing after its end cycle', () => {
    const result = generateInto(
      emptyCycle(),
      [template({ startMonth: '2026-06', endMonth: '2026-07' })],
      newId,
    );

    expect(result.added).toHaveLength(0);
  });

  it('generates nothing for a paused template', () => {
    const result = generateInto(emptyCycle(), [template().pause()], newId);

    expect(result.added).toHaveLength(0);
  });
});

describe('generateInto is idempotent', () => {
  it('adds nothing the second time', () => {
    const once = generateInto(emptyCycle(), [template()], newId);
    const twice = generateInto(once.cycle, [template()], newId);

    expect(twice.added).toHaveLength(0);
    expect(twice.cycle.entries).toHaveLength(1);
  });

  // Regenerating must never quietly undo a decision the user made.
  it('leaves a settled entry exactly as it was', () => {
    const once = generateInto(emptyCycle(), [template()], newId);
    const settled = once.cycle.settleEntry(
      'tpl-health@2026-08',
      Money.fromCents(-33_000),
      SettlementStatus.Paid,
    );

    const again = generateInto(settled, [template()], newId);

    expect(again.added).toHaveLength(0);
    expect(again.cycle.entries[0]?.amount.actual?.cents).toBe(-33_000);
  });

  it('leaves an overridden entry overridden', () => {
    const once = generateInto(emptyCycle(), [template()], newId);
    const overridden = once.cycle.overrideEntry(
      'tpl-health@2026-08',
      Money.fromCents(-45_000),
    );

    const again = generateInto(overridden, [template()], newId);

    expect(again.added).toHaveLength(0);
    expect(again.cycle.entries[0]?.isOverridden).toBe(true);
    expect(again.cycle.entries[0]?.amount.planned.cents).toBe(-45_000);
  });

  // The amount changing must not produce a second entry — the cycle already
  // has this template's entry, and changing it is an override, not a new row.
  it('does not add a second entry when the template amount has changed', () => {
    const once = generateInto(emptyCycle(), [template()], newId);
    const raised = template({ amount: reais(-400) });

    const again = generateInto(once.cycle, [raised], newId);

    expect(again.cycle.entries).toHaveLength(1);
    expect(again.cycle.entries[0]?.amount.planned.cents).toBe(-32_000);
  });
});

describe('generateInto reports what it could not place', () => {
  // Moving a bill's date silently would land it in a cycle the user did not
  // expect, so it is reported instead.
  it('skips a due day that falls in neither month the cycle spans', () => {
    // The August cycle runs 5 Aug – 3 Sep, so it has no 4th.
    const result = generateInto(
      emptyCycle(),
      [template({ dueDayOfMonth: 4 })],
      newId,
    );

    expect(result.added).toHaveLength(0);
    expect(result.skipped).toEqual([
      {
        templateId: 'tpl-health',
        name: 'Health Plan',
        reason: 'DUE_DAY_OUTSIDE_CYCLE',
      },
    ]);
  });

  it('still places the templates it can', () => {
    const result = generateInto(
      emptyCycle(),
      [template({ dueDayOfMonth: 4 }), template({ id: 'tpl-ok' })],
      newId,
    );

    expect(result.added).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
  });
});
