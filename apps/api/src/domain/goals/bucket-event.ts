import { DomainError } from '../shared/domain-error.js';
import type { LocalDate } from '../shared/local-date.js';
import { Money } from '../shared/money.js';

export class InvalidBucketEvent extends DomainError {}

/**
 * Everything that ever moved a bucket's balance, as a discriminated union.
 *
 * The log is append-only and the balance is the fold over it. That is the
 * direct answer to the spreadsheet's weakest point: it hard-coded balances
 * over its own running total whenever reality drifted, leaving no trace of
 * why, and could not tell a deposit from accrued interest.
 */
export type BucketEvent =
  | {
      readonly kind: 'CONTRIBUTION';
      readonly id: string;
      readonly cycleMonth: string;
      readonly amount: Money;
    }
  | {
      readonly kind: 'OVERRIDE';
      readonly id: string;
      readonly cycleMonth: string;
      readonly amount: Money;
      /** What the rule would have contributed, kept so the choice is legible. */
      readonly ruleWouldHaveBeen: Money;
    }
  | {
      readonly kind: 'YIELD';
      readonly id: string;
      readonly date: LocalDate;
      readonly amount: Money;
    }
  | {
      readonly kind: 'CORRECTION';
      readonly id: string;
      readonly date: LocalDate;
      readonly newBalance: Money;
      readonly reason: string;
    }
  | {
      readonly kind: 'WITHDRAWAL';
      readonly id: string;
      readonly date: LocalDate;
      readonly amount: Money;
      readonly reason: string;
    };

export const BucketEvents = {
  contribution: (
    id: string,
    cycleMonth: string,
    amount: Money,
  ): BucketEvent => {
    if (amount.isNegative()) {
      throw new InvalidBucketEvent('A contribution cannot be negative.');
    }
    return { kind: 'CONTRIBUTION', id, cycleMonth, amount };
  },

  override: (
    id: string,
    cycleMonth: string,
    amount: Money,
    ruleWouldHaveBeen: Money,
  ): BucketEvent => {
    if (amount.isNegative()) {
      throw new InvalidBucketEvent('An override cannot be negative.');
    }
    return { kind: 'OVERRIDE', id, cycleMonth, amount, ruleWouldHaveBeen };
  },

  /** Interest or returns: growth from returns, never from saving. */
  yield: (id: string, date: LocalDate, amount: Money): BucketEvent => ({
    kind: 'YIELD',
    id,
    date,
    amount,
  }),

  correction: (
    id: string,
    date: LocalDate,
    newBalance: Money,
    reason: string,
  ): BucketEvent => {
    if (reason.trim() === '') {
      throw new InvalidBucketEvent(
        'A correction needs a reason: an unexplained balance is what this log exists to prevent.',
      );
    }
    if (newBalance.isNegative()) {
      throw new InvalidBucketEvent('A bucket cannot hold less than nothing.');
    }
    return { kind: 'CORRECTION', id, date, newBalance, reason: reason.trim() };
  },

  withdrawal: (
    id: string,
    date: LocalDate,
    amount: Money,
    reason: string,
  ): BucketEvent => {
    if (reason.trim() === '') {
      throw new InvalidBucketEvent('A withdrawal needs a reason.');
    }
    if (!amount.isPositive()) {
      throw new InvalidBucketEvent('A withdrawal takes out a positive amount.');
    }
    return { kind: 'WITHDRAWAL', id, date, amount, reason: reason.trim() };
  },
} as const;

/**
 * The balance after an event, given the one before it. A correction *sets*
 * the balance rather than adjusting it, which is exactly the operation the
 * spreadsheet performed silently.
 */
export function applyEvent(balance: Money, event: BucketEvent): Money {
  switch (event.kind) {
    case 'CONTRIBUTION':
    case 'OVERRIDE':
    case 'YIELD':
      return balance.plus(event.amount);
    case 'WITHDRAWAL':
      return balance.minus(event.amount);
    case 'CORRECTION':
      return event.newBalance;
    default: {
      const unhandled: never = event;
      throw new InvalidBucketEvent(
        `Unhandled bucket event: ${JSON.stringify(unhandled)}`,
      );
    }
  }
}

export function foldBalance(events: readonly BucketEvent[]): Money {
  return events.reduce<Money>(applyEvent, Money.zero());
}

/** Growth from returns alone, which the spreadsheet could not separate out. */
export function totalYield(events: readonly BucketEvent[]): Money {
  return Money.sum(
    events
      .filter((event) => event.kind === 'YIELD')
      .map((event) => event.amount),
  );
}

/** Growth from saving alone: contributions and overrides, less withdrawals. */
export function totalContributed(events: readonly BucketEvent[]): Money {
  return events.reduce<Money>((total, event) => {
    switch (event.kind) {
      case 'CONTRIBUTION':
      case 'OVERRIDE':
        return total.plus(event.amount);
      case 'WITHDRAWAL':
        return total.minus(event.amount);
      default:
        return total;
    }
  }, Money.zero());
}
