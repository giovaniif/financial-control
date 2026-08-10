import { DomainError } from './domain-error.js';
import { Money } from './money.js';

export class InvalidSettlement extends DomainError {}

export const SettlementStatus = {
  Pending: 'PENDING',
  Paid: 'PAID',
  Received: 'RECEIVED',
  Skipped: 'SKIPPED',
  Overdue: 'OVERDUE',
} as const;

export type SettlementStatus =
  (typeof SettlementStatus)[keyof typeof SettlementStatus];

const SETTLED = new Set<SettlementStatus>([
  SettlementStatus.Paid,
  SettlementStatus.Received,
  SettlementStatus.Skipped,
]);

/**
 * Every amount in the app: what was planned, what actually happened, and where
 * it is between the two.
 *
 * A projected entry simply has no actual amount — that is the normal state of
 * anything in a future cycle, not an error. Variance is derived from the pair
 * and never stored, so the two can never disagree.
 */
export class PlannedActual {
  private constructor(
    readonly planned: Money,
    readonly actual: Money | undefined,
    readonly status: SettlementStatus,
  ) {}

  static planned(amount: Money): PlannedActual {
    return new PlannedActual(amount, undefined, SettlementStatus.Pending);
  }

  get isSettled(): boolean {
    return SETTLED.has(this.status);
  }

  /** Turns a plan into a fact. `PAID` and `RECEIVED` are the only ways in. */
  settle(actual: Money, status: SettlementStatus): PlannedActual {
    if (this.isSettled) {
      throw new InvalidSettlement(
        `Already ${this.status}; reopen the cycle to correct it.`,
      );
    }
    if (
      status !== SettlementStatus.Paid &&
      status !== SettlementStatus.Received
    ) {
      throw new InvalidSettlement(
        `Settling records money moving; ${status} does not. Use skip() instead.`,
      );
    }
    return new PlannedActual(this.planned, actual, status);
  }

  /**
   * Settles without money moving. A skipped entry counts as resolved, which is
   * what lets its cycle close, but it realises nothing.
   */
  skip(): PlannedActual {
    if (this.isSettled) {
      throw new InvalidSettlement(`Already ${this.status}; cannot skip it.`);
    }
    return new PlannedActual(this.planned, undefined, SettlementStatus.Skipped);
  }

  markOverdue(): PlannedActual {
    if (this.isSettled) {
      throw new InvalidSettlement(
        `Already ${this.status}; it cannot be overdue.`,
      );
    }
    return new PlannedActual(this.planned, undefined, SettlementStatus.Overdue);
  }

  /** What this entry is worth to a total: the actual once known, else the plan. */
  get realised(): Money {
    if (this.status === SettlementStatus.Skipped) {
      return Money.zero();
    }
    return this.actual ?? this.planned;
  }

  /** Undefined until settled — there is nothing to compare a plan against yet. */
  get variance(): Money | undefined {
    return this.isSettled ? this.realised.minus(this.planned) : undefined;
  }
}
