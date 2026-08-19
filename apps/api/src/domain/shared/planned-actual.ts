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

/**
 * How a status reads on screen. Agrees with `lançamento`, which is masculine,
 * so an entry is `pago` rather than `paga`.
 */
export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = {
  PENDING: 'pendente',
  PAID: 'pago',
  RECEIVED: 'recebido',
  SKIPPED: 'ignorado',
  OVERDUE: 'atrasado',
};

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
        `Este lançamento já está ${SETTLEMENT_STATUS_LABELS[this.status]}; reabra o ciclo para corrigi-lo.`,
      );
    }
    if (
      status !== SettlementStatus.Paid &&
      status !== SettlementStatus.Received
    ) {
      throw new InvalidSettlement(
        `Dar baixa registra dinheiro entrando ou saindo, e ${SETTLEMENT_STATUS_LABELS[status]} não registra nada disso: use ignorar.`,
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
      throw new InvalidSettlement(
        `Este lançamento já está ${SETTLEMENT_STATUS_LABELS[this.status]}; não dá para ignorá-lo.`,
      );
    }
    return new PlannedActual(this.planned, undefined, SettlementStatus.Skipped);
  }

  markOverdue(): PlannedActual {
    if (this.isSettled) {
      throw new InvalidSettlement(
        `Este lançamento já está ${SETTLEMENT_STATUS_LABELS[this.status]}; não pode ficar atrasado.`,
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
