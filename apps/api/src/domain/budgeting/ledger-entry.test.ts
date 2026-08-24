import { describe, expect, it } from 'vitest';

import { LocalDate } from '../shared/local-date.js';
import { Money } from '../shared/money.js';
import { SettlementStatus } from '../shared/planned-actual.js';
import {
  describeOrigin,
  EntryKind,
  InvalidEntry,
  LedgerEntry,
  Origin,
} from './ledger-entry.js';

const anEntry = (
  overrides: Partial<Parameters<typeof LedgerEntry.create>[0]> = {},
) =>
  LedgerEntry.create({
    id: 'entry-1',
    description: 'Health Plan',
    kind: EntryKind.Fixed,
    dueDate: LocalDate.parse('2026-08-08'),
    planned: Money.fromCents(-32000),
    ...overrides,
  });

describe('LedgerEntry.create', () => {
  it('starts pending, unsettled and entered by hand', () => {
    const entry = anEntry();

    expect(entry.status).toBe(SettlementStatus.Pending);
    expect(entry.isSettled).toBe(false);
    expect(entry.origin.kind).toBe('MANUAL');
    expect(entry.isEstimate).toBe(false);
  });

  it.each(['', '   '])('rejects a blank description (%s)', (description) => {
    expect(() => anEntry({ description })).toThrow(InvalidEntry);
  });

  it('carries the origin it was generated from', () => {
    const entry = anEntry({ origin: Origin.fromTemplate('tpl-7') });

    expect(entry.origin).toEqual({
      kind: 'FROM_TEMPLATE',
      templateId: 'tpl-7',
    });
  });
});

describe('LedgerEntry settlement', () => {
  it('records the actual amount when the bill differs from the plan', () => {
    const settled = anEntry().settle(
      Money.fromCents(-32016),
      SettlementStatus.Paid,
    );

    expect(settled.realised.cents).toBe(-32016);
    expect(settled.amount.variance?.cents).toBe(-16);
  });

  it('leaves the original entry untouched', () => {
    const entry = anEntry();

    entry.settle(Money.fromCents(-32016), SettlementStatus.Paid);

    expect(entry.isSettled).toBe(false);
  });

  it('skips without realising anything', () => {
    const skipped = anEntry().skip();

    expect(skipped.isSettled).toBe(true);
    expect(skipped.realised.isZero()).toBe(true);
  });

  it('flags an unsettled entry as overdue', () => {
    expect(anEntry().markOverdue().status).toBe(SettlementStatus.Overdue);
  });
});

describe('LedgerEntry.realised', () => {
  it('is the planned amount while the entry is only projected', () => {
    expect(anEntry().realised.cents).toBe(-32000);
  });
});

describe('LedgerEntry.override', () => {
  const generated = () =>
    anEntry({
      origin: Origin.fromTemplate('tpl-7'),
      planned: Money.fromCents(-32000),
    });

  it('replaces the planned amount without touching the template', () => {
    const overridden = generated().override(Money.fromCents(-45000));

    expect(overridden.amount.planned.cents).toBe(-45000);
    expect(overridden.isOverridden).toBe(true);
  });

  it('remembers what the template would have produced', () => {
    const overridden = generated().override(Money.fromCents(-45000));

    expect(
      overridden.origin.kind === 'OVERRIDE' &&
        overridden.origin.projected.cents,
    ).toBe(-32000);
  });

  it('restores the projected amount and the original origin on revert', () => {
    const reverted = generated()
      .override(Money.fromCents(-45000))
      .revertOverride();

    expect(reverted.amount.planned.cents).toBe(-32000);
    expect(reverted.origin).toEqual({
      kind: 'FROM_TEMPLATE',
      templateId: 'tpl-7',
    });
    expect(reverted.isOverridden).toBe(false);
  });

  // Otherwise reverting would land on a previous guess rather than on what the
  // template actually says.
  it('keeps the first projected value when overridden twice', () => {
    const reverted = generated()
      .override(Money.fromCents(-45000))
      .override(Money.fromCents(-50000))
      .revertOverride();

    expect(reverted.amount.planned.cents).toBe(-32000);
  });

  it('refuses to override something already settled', () => {
    const settled = generated().settle(
      Money.fromCents(-32000),
      SettlementStatus.Paid,
    );

    expect(() => settled.override(Money.fromCents(-45000))).toThrow(
      InvalidEntry,
    );
  });

  it('refuses to revert an entry that was never overridden', () => {
    expect(() => generated().revertOverride()).toThrow(InvalidEntry);
  });
});

describe('describeOrigin', () => {
  it.each([
    [Origin.manual(), 'entered by hand'],
    [Origin.fromTemplate('tpl-7'), 'generated from template tpl-7'],
    [Origin.fromAllocation('reserve'), 'allocated to bucket reserve'],
  ])('describes %o', (origin, expected) => {
    expect(describeOrigin(origin)).toBe(expected);
  });

  it('describes an override in terms of what it replaced', () => {
    const overridden = anEntry({
      origin: Origin.fromTemplate('tpl-7'),
    }).override(Money.fromCents(-45000));

    expect(describeOrigin(overridden.origin)).toBe(
      'overridden — generated from template tpl-7',
    );
  });
});

describe('LedgerEntry estimates', () => {
  it('carries the estimate flag that keeps a guess out of a confirmed total', () => {
    expect(anEntry({ isEstimate: true }).isEstimate).toBe(true);
  });
});
