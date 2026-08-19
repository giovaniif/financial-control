import { DomainError } from '../shared/domain-error.js';
import type { LocalDate } from '../shared/local-date.js';
import type { Money } from '../shared/money.js';
import type { SettlementStatus } from '../shared/planned-actual.js';
import {
  PlannedActual,
  SETTLEMENT_STATUS_LABELS,
} from '../shared/planned-actual.js';

export class InvalidEntry extends DomainError {}

/** What kind of line this is. The calculation chain sums by these. */
export const EntryKind = {
  Income: 'INCOME',
  Fixed: 'FIXED',
  Invoice: 'INVOICE',
  Variable: 'VARIABLE',
  Allocation: 'ALLOCATION',
} as const;

export type EntryKind = (typeof EntryKind)[keyof typeof EntryKind];

/**
 * Where an entry came from, as a discriminated union. Every consumer switches
 * exhaustively with a `never` default, so adding a variant breaks the build
 * everywhere it has to be handled rather than falling through silently.
 */
export type EntryOrigin =
  | { readonly kind: 'MANUAL' }
  | { readonly kind: 'FROM_TEMPLATE'; readonly templateId: string }
  | { readonly kind: 'FROM_INVOICE'; readonly invoiceId: string }
  | { readonly kind: 'FROM_ALLOCATION'; readonly bucketId: string }
  | {
      readonly kind: 'OVERRIDE';
      /** What the entry was generated from before it was overridden. */
      readonly original: EntryOrigin;
      /** The value the template or invoice would have produced. */
      readonly projected: Money;
    };

export const Origin = {
  manual: (): EntryOrigin => ({ kind: 'MANUAL' }),
  fromTemplate: (templateId: string): EntryOrigin => ({
    kind: 'FROM_TEMPLATE',
    templateId,
  }),
  fromInvoice: (invoiceId: string): EntryOrigin => ({
    kind: 'FROM_INVOICE',
    invoiceId,
  }),
  fromAllocation: (bucketId: string): EntryOrigin => ({
    kind: 'FROM_ALLOCATION',
    bucketId,
  }),
} as const;

/** Describes an origin for a person, and proves the union is handled in full. */
export function describeOrigin(origin: EntryOrigin): string {
  switch (origin.kind) {
    case 'MANUAL':
      return 'entered by hand';
    case 'FROM_TEMPLATE':
      return `generated from template ${origin.templateId}`;
    case 'FROM_INVOICE':
      return `the invoice ${origin.invoiceId}`;
    case 'FROM_ALLOCATION':
      return `allocated to bucket ${origin.bucketId}`;
    case 'OVERRIDE':
      return `overridden — ${describeOrigin(origin.original)}`;
    default: {
      const unhandled: never = origin;
      throw new InvalidEntry(
        `Origem não tratada: ${JSON.stringify(unhandled)}`,
      );
    }
  }
}

interface LedgerEntryState {
  readonly id: string;
  readonly description: string;
  readonly kind: EntryKind;
  readonly dueDate: LocalDate;
  readonly amount: PlannedActual;
  readonly isEstimate: boolean;
  readonly origin: EntryOrigin;
}

/**
 * One line in a cycle's ledger.
 *
 * Its `dueDate` is the only thing that decides which cycle it belongs to — no
 * other field participates in that question.
 */
export class LedgerEntry {
  private constructor(private readonly state: LedgerEntryState) {}

  static create(input: {
    id: string;
    description: string;
    kind: EntryKind;
    dueDate: LocalDate;
    planned: Money;
    isEstimate?: boolean;
    origin?: EntryOrigin;
  }): LedgerEntry {
    if (input.description.trim() === '') {
      throw new InvalidEntry('Um lançamento precisa de uma descrição.');
    }

    return new LedgerEntry({
      id: input.id,
      description: input.description,
      kind: input.kind,
      dueDate: input.dueDate,
      amount: PlannedActual.planned(input.planned),
      isEstimate: input.isEstimate ?? false,
      origin: input.origin ?? Origin.manual(),
    });
  }

  get id(): string {
    return this.state.id;
  }

  get description(): string {
    return this.state.description;
  }

  get kind(): EntryKind {
    return this.state.kind;
  }

  get dueDate(): LocalDate {
    return this.state.dueDate;
  }

  get amount(): PlannedActual {
    return this.state.amount;
  }

  get isEstimate(): boolean {
    return this.state.isEstimate;
  }

  get origin(): EntryOrigin {
    return this.state.origin;
  }

  get status(): SettlementStatus {
    return this.state.amount.status;
  }

  get isSettled(): boolean {
    return this.state.amount.isSettled;
  }

  /** What this line contributes to a total: the actual once known, else the plan. */
  get realised(): Money {
    return this.state.amount.realised;
  }

  get isOverridden(): boolean {
    return this.state.origin.kind === 'OVERRIDE';
  }

  settle(actual: Money, status: SettlementStatus): LedgerEntry {
    return this.with({ amount: this.state.amount.settle(actual, status) });
  }

  skip(): LedgerEntry {
    return this.with({ amount: this.state.amount.skip() });
  }

  markOverdue(): LedgerEntry {
    return this.with({ amount: this.state.amount.markOverdue() });
  }

  /**
   * Replaces the planned amount for this cycle only, without touching whatever
   * generated it. The projected value is kept so the override can be reverted.
   */
  override(planned: Money): LedgerEntry {
    if (this.isSettled) {
      throw new InvalidEntry(
        `${this.state.description} já está ${SETTLEMENT_STATUS_LABELS[this.status]}; não dá para sobrescrever o valor.`,
      );
    }
    if (this.state.origin.kind === 'OVERRIDE') {
      // Re-overriding keeps the *first* projected value, so reverting always
      // returns to what the template said rather than to a previous guess.
      return this.with({ amount: PlannedActual.planned(planned) });
    }

    return this.with({
      amount: PlannedActual.planned(planned),
      origin: {
        kind: 'OVERRIDE',
        original: this.state.origin,
        projected: this.state.amount.planned,
      },
    });
  }

  /** Puts back exactly the projected amount and the origin it came from. */
  revertOverride(): LedgerEntry {
    const { origin } = this.state;
    if (origin.kind !== 'OVERRIDE') {
      throw new InvalidEntry(
        `${this.state.description} não tem valor sobrescrito; não há nada a reverter.`,
      );
    }

    return this.with({
      amount: PlannedActual.planned(origin.projected),
      origin: origin.original,
    });
  }

  private with(changes: Partial<LedgerEntryState>): LedgerEntry {
    return new LedgerEntry({ ...this.state, ...changes });
  }
}
