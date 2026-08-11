import { DomainError } from '../shared/domain-error.js';
import { LocalDate } from '../shared/local-date.js';
import { Money } from '../shared/money.js';
import type { SettlementStatus } from '../shared/planned-actual.js';
import type { CycleRef } from './cycle-ref.js';
import type { LedgerEntry } from './ledger-entry.js';
import { EntryKind } from './ledger-entry.js';

export class CycleClosed extends DomainError {}
export class EntryNotInCycle extends DomainError {}
export class EntryNotFound extends DomainError {}
export class CycleNotSettled extends DomainError {}

export const CycleStatus = {
  Open: 'OPEN',
  Closed: 'CLOSED',
} as const;

export type CycleStatus = (typeof CycleStatus)[keyof typeof CycleStatus];

/**
 * Which entries a total counts. The whole app can be read two ways, and the
 * chain is computed the same way for both — there is no second code path.
 */
export const Estimates = {
  /** Unconfirmed placeholders left out: what is actually known. */
  Excluded: 'EXCLUDED',
  Included: 'INCLUDED',
} as const;

export type Estimates = (typeof Estimates)[keyof typeof Estimates];

/** The calculation chain, in the order it must always be presented. */
export interface CalculationChain {
  readonly openingBalance: Money;
  readonly totalIncome: Money;
  readonly totalOutcome: Money;
  readonly variables: Money;
  readonly surplus: Money;
  readonly expectedSurplus: Money;
  readonly allocations: Money;
  readonly netSurplus: Money;
  readonly closingBalance: Money;
}

/** One row of the ledger, with the balance standing after it. */
export interface RunningBalanceRow {
  readonly entry: LedgerEntry;
  readonly balance: Money;
}

export interface LowWaterMark {
  readonly balance: Money;
  readonly date: LocalDate;
  readonly entry: LedgerEntry;
}

interface CycleState {
  readonly id: string;
  readonly ref: CycleRef;
  readonly status: CycleStatus;
  readonly openingBalance: Money;
  readonly entries: readonly LedgerEntry[];
}

/**
 * A cycle and everything that happens in it — the consistency boundary for
 * "what happens between one payday and the next".
 *
 * The chain is derived on every read and never stored, so a persisted total
 * can never disagree with the entries it came from.
 */
export class Cycle {
  private constructor(private readonly state: CycleState) {}

  static open(input: {
    id: string;
    ref: CycleRef;
    openingBalance: Money;
    entries?: readonly LedgerEntry[];
  }): Cycle {
    const cycle = new Cycle({
      id: input.id,
      ref: input.ref,
      status: CycleStatus.Open,
      openingBalance: input.openingBalance,
      entries: [],
    });

    return (input.entries ?? []).reduce<Cycle>(
      (built, entry) => built.addEntry(entry),
      cycle,
    );
  }

  /** Rebuilds a cycle from storage without replaying its invariants. */
  static rehydrate(state: CycleState): Cycle {
    return new Cycle(state);
  }

  get id(): string {
    return this.state.id;
  }

  get ref(): CycleRef {
    return this.state.ref;
  }

  get status(): CycleStatus {
    return this.state.status;
  }

  get isClosed(): boolean {
    return this.state.status === CycleStatus.Closed;
  }

  get openingBalance(): Money {
    return this.state.openingBalance;
  }

  /** In due-date order, which is the order the ledger is read in. */
  get entries(): readonly LedgerEntry[] {
    return [...this.state.entries].sort(byDueDateThenKind);
  }

  get unsettledEntries(): readonly LedgerEntry[] {
    return this.entries.filter((entry) => !entry.isSettled);
  }

  addEntry(entry: LedgerEntry): Cycle {
    this.assertOpen();
    if (!this.state.ref.contains(entry.dueDate)) {
      throw new EntryNotInCycle(
        `${entry.description} is due ${entry.dueDate.toISO()}, outside ${this.state.ref.toString()}.`,
      );
    }
    return this.with({ entries: [...this.state.entries, entry] });
  }

  removeEntry(entryId: string): Cycle {
    this.assertOpen();
    this.entryOrThrow(entryId);

    return this.with({
      entries: this.state.entries.filter((entry) => entry.id !== entryId),
    });
  }

  settleEntry(entryId: string, actual: Money, status: SettlementStatus): Cycle {
    return this.replaceEntry(entryId, (entry) => entry.settle(actual, status));
  }

  skipEntry(entryId: string): Cycle {
    return this.replaceEntry(entryId, (entry) => entry.skip());
  }

  overrideEntry(entryId: string, planned: Money): Cycle {
    return this.replaceEntry(entryId, (entry) => entry.override(planned));
  }

  revertEntryOverride(entryId: string): Cycle {
    return this.replaceEntry(entryId, (entry) => entry.revertOverride());
  }

  /**
   * Freezes the cycle. Every entry must first be settled or skipped: an
   * unresolved row would leave the closing balance — and therefore the next
   * cycle's opening balance — resting on a guess.
   */
  close(): Cycle {
    this.assertOpen();
    const unsettled = this.unsettledEntries;
    if (unsettled.length > 0) {
      throw new CycleNotSettled(
        `${this.state.ref.label} has ${String(unsettled.length)} unsettled entr${unsettled.length === 1 ? 'y' : 'ies'}: settle or skip them first.`,
      );
    }
    return this.with({ status: CycleStatus.Closed });
  }

  reopen(): Cycle {
    if (!this.isClosed) {
      return this;
    }
    return this.with({ status: CycleStatus.Open });
  }

  /** The whole model at a glance, computed fresh from the entries. */
  chain(estimates: Estimates = Estimates.Included): CalculationChain {
    const counted = this.countedEntries(estimates);
    const sumOf = (...kinds: EntryKind[]) =>
      Money.sum(
        counted
          .filter((entry) => kinds.includes(entry.kind))
          .map((entry) => entry.realised),
      );

    const totalIncome = sumOf(EntryKind.Income);
    const variables = sumOf(EntryKind.Variable);
    const allocations = sumOf(EntryKind.Allocation).abs();

    // Outgoing money is negative in the domain, so Total Outcome is reported
    // as the positive figure the UI shows and subtracted rather than added.
    const fixedOutflow = sumOf(EntryKind.Fixed, EntryKind.Invoice);
    const variableOutflow = Money.sum(
      counted
        .filter((entry) => entry.kind === EntryKind.Variable)
        .map((entry) => entry.realised)
        .filter((amount) => amount.isNegative()),
    );
    const totalOutcome = fixedOutflow.plus(variableOutflow).abs();

    const surplus = totalIncome.minus(fixedOutflow.abs());
    const expectedSurplus = surplus.plus(variables);
    const netSurplus = expectedSurplus.minus(allocations);

    return {
      openingBalance: this.state.openingBalance,
      totalIncome,
      totalOutcome,
      variables,
      surplus,
      expectedSurplus,
      allocations,
      netSurplus,
      closingBalance: this.state.openingBalance.plus(netSurplus),
    };
  }

  /** Becomes the next cycle's opening balance. */
  closingBalance(estimates: Estimates = Estimates.Included): Money {
    return this.chain(estimates).closingBalance;
  }

  /**
   * The balance standing after each entry, in due-date order.
   *
   * This is what makes the ledger answer "when" and not just "how much": cash
   * can bottom out mid-cycle and recover before the closing balance ever shows
   * a problem.
   */
  runningBalance(
    estimates: Estimates = Estimates.Included,
  ): readonly RunningBalanceRow[] {
    let balance = this.state.openingBalance;

    return this.countedEntries(estimates).map((entry) => {
      balance = balance.plus(entry.realised);
      return { entry, balance };
    });
  }

  /** The lowest the balance gets, and the entry that took it there. */
  lowWaterMark(
    estimates: Estimates = Estimates.Included,
  ): LowWaterMark | undefined {
    return this.runningBalance(estimates).reduce<LowWaterMark | undefined>(
      (lowest, row) =>
        lowest === undefined || row.balance.isLessThan(lowest.balance)
          ? { balance: row.balance, date: row.entry.dueDate, entry: row.entry }
          : lowest,
      undefined,
    );
  }

  /** The first date the balance crosses zero, if it ever does. */
  firstNegativeDate(
    estimates: Estimates = Estimates.Included,
  ): LocalDate | undefined {
    return this.runningBalance(estimates).find((row) =>
      row.balance.isNegative(),
    )?.entry.dueDate;
  }

  private countedEntries(estimates: Estimates): readonly LedgerEntry[] {
    return estimates === Estimates.Included
      ? this.entries
      : this.entries.filter((entry) => !entry.isEstimate);
  }

  private entryOrThrow(entryId: string): LedgerEntry {
    const entry = this.state.entries.find(
      (candidate) => candidate.id === entryId,
    );
    if (entry === undefined) {
      throw new EntryNotFound(
        `No entry ${entryId} in ${this.state.ref.label}.`,
      );
    }
    return entry;
  }

  private replaceEntry(
    entryId: string,
    change: (entry: LedgerEntry) => LedgerEntry,
  ): Cycle {
    this.assertOpen();
    const target = this.entryOrThrow(entryId);

    return this.with({
      entries: this.state.entries.map((entry) =>
        entry === target ? change(entry) : entry,
      ),
    });
  }

  private assertOpen(): void {
    if (this.isClosed) {
      throw new CycleClosed(
        `${this.state.ref.label} is closed; reopen it before changing anything.`,
      );
    }
  }

  private with(changes: Partial<CycleState>): Cycle {
    return new Cycle({ ...this.state, ...changes });
  }
}

/**
 * Due date first. Within a day, money in lands before money out and
 * allocations settle last, so the running balance never dips through a
 * trough that the day's own income already covered.
 */
const KIND_ORDER: Record<EntryKind, number> = {
  [EntryKind.Income]: 0,
  [EntryKind.Variable]: 1,
  [EntryKind.Fixed]: 2,
  [EntryKind.Invoice]: 3,
  [EntryKind.Allocation]: 4,
};

function byDueDateThenKind(a: LedgerEntry, b: LedgerEntry): number {
  const byDate = LocalDate.compare(a.dueDate, b.dueDate);

  return byDate === 0 ? KIND_ORDER[a.kind] - KIND_ORDER[b.kind] : byDate;
}
