import { describe, expect, it } from 'vitest';

import { Money } from './money.js';
import {
  InvalidSettlement,
  PlannedActual,
  SettlementStatus,
} from './planned-actual.js';

const planned = (cents: number) =>
  PlannedActual.planned(Money.fromCents(cents));

describe('PlannedActual', () => {
  it('starts pending, with a planned amount and no actual one', () => {
    const amount = planned(-29300);

    expect(amount.status).toBe(SettlementStatus.Pending);
    expect(amount.planned.cents).toBe(-29300);
    expect(amount.actual).toBeUndefined();
  });

  it('is not settled while it is pending', () => {
    expect(planned(-29300).isSettled).toBe(false);
  });
});

describe('PlannedActual.settle', () => {
  it('records what was actually paid', () => {
    const settled = planned(-29300).settle(
      Money.fromCents(-31200),
      SettlementStatus.Paid,
    );

    expect(settled.status).toBe(SettlementStatus.Paid);
    expect(settled.actual?.cents).toBe(-31200);
    expect(settled.isSettled).toBe(true);
  });

  it('records money received', () => {
    const settled = planned(1800000).settle(
      Money.fromCents(1800000),
      SettlementStatus.Received,
    );

    expect(settled.isSettled).toBe(true);
  });

  it('never mutates the entry it settles', () => {
    const original = planned(-29300);

    original.settle(Money.fromCents(-31200), SettlementStatus.Paid);

    expect(original.status).toBe(SettlementStatus.Pending);
    expect(original.actual).toBeUndefined();
  });

  it('rejects settling something already settled', () => {
    const settled = planned(-29300).settle(
      Money.fromCents(-29300),
      SettlementStatus.Paid,
    );

    expect(() =>
      settled.settle(Money.fromCents(-100), SettlementStatus.Paid),
    ).toThrow(InvalidSettlement);
  });

  it.each([SettlementStatus.Pending, SettlementStatus.Overdue])(
    'rejects %s as a settled status',
    (status) => {
      expect(() =>
        planned(-29300).settle(Money.fromCents(-29300), status),
      ).toThrow(InvalidSettlement);
    },
  );
});

describe('PlannedActual.skip', () => {
  // A skipped entry is settled — it is what lets a cycle close — but no money
  // moved, so it has no actual amount and contributes nothing to a total.
  it('settles without an actual amount', () => {
    const skipped = planned(-29300).skip();

    expect(skipped.status).toBe(SettlementStatus.Skipped);
    expect(skipped.isSettled).toBe(true);
    expect(skipped.actual).toBeUndefined();
  });

  it('contributes nothing to what was realised', () => {
    expect(planned(-29300).skip().realised.isZero()).toBe(true);
  });
});

describe('PlannedActual.markOverdue', () => {
  it('flags an unsettled entry whose due date has passed', () => {
    const overdue = planned(-29300).markOverdue();

    expect(overdue.status).toBe(SettlementStatus.Overdue);
    expect(overdue.isSettled).toBe(false);
  });

  it('can still be settled afterwards', () => {
    const paid = planned(-29300)
      .markOverdue()
      .settle(Money.fromCents(-29300), SettlementStatus.Paid);

    expect(paid.status).toBe(SettlementStatus.Paid);
  });

  it('refuses to flag something already settled', () => {
    expect(() => planned(-29300).skip().markOverdue()).toThrow(
      InvalidSettlement,
    );
  });
});

describe('PlannedActual variance', () => {
  it('has no variance until it is settled', () => {
    expect(planned(-29300).variance).toBeUndefined();
  });

  it('is zero when the actual amount matches the plan', () => {
    const settled = planned(-29300).settle(
      Money.fromCents(-29300),
      SettlementStatus.Paid,
    );

    expect(settled.variance?.isZero()).toBe(true);
  });

  it('is what the bill came in over the plan', () => {
    const settled = planned(-30000).settle(
      Money.fromCents(-32016),
      SettlementStatus.Paid,
    );

    expect(settled.variance?.cents).toBe(-2016);
  });

  it('is what a skipped entry saved against its plan', () => {
    expect(planned(-29300).skip().variance?.cents).toBe(29300);
  });
});

describe('PlannedActual.realised', () => {
  it('is the planned amount while the entry is only projected', () => {
    expect(planned(-29300).realised.cents).toBe(-29300);
  });

  it('is the actual amount once settled', () => {
    const settled = planned(-30000).settle(
      Money.fromCents(-32016),
      SettlementStatus.Paid,
    );

    expect(settled.realised.cents).toBe(-32016);
  });
});
