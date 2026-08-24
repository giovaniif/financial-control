import type {
  Cycle as CycleRow,
  LedgerEntry as LedgerEntryRow,
} from '@prisma/client';

import type { CycleRef } from '../../../domain/budgeting/cycle-ref.js';
import { Cycle } from '../../../domain/budgeting/cycle.js';
import type { EntryOrigin } from '../../../domain/budgeting/ledger-entry.js';
import { LedgerEntry } from '../../../domain/budgeting/ledger-entry.js';
import { LocalDate } from '../../../domain/shared/local-date.js';
import { Money } from '../../../domain/shared/money.js';

type Row = CycleRow & { entries: LedgerEntryRow[] };

/** The flattened origin columns, back into the domain's union. */
function toOrigin(row: LedgerEntryRow): EntryOrigin {
  if (row.originKind === 'OVERRIDE') {
    return {
      kind: 'OVERRIDE',
      original: toSimpleOrigin(row.overriddenKind, row.overriddenRef),
      projected: Money.fromCents(Number(row.projectedCents ?? 0n)),
    };
  }
  return toSimpleOrigin(row.originKind, row.originRef);
}

function toSimpleOrigin(
  kind: LedgerEntryRow['originKind'] | null,
  ref: string | null,
): EntryOrigin {
  switch (kind) {
    case 'FROM_TEMPLATE':
      return { kind: 'FROM_TEMPLATE', templateId: ref ?? '' };
    case 'FROM_ALLOCATION':
      return { kind: 'FROM_ALLOCATION', bucketId: ref ?? '' };
    default:
      return { kind: 'MANUAL' };
  }
}

/** The domain's union, flattened onto columns. Overrides nest one level deep. */
function fromOrigin(origin: EntryOrigin): {
  originKind: LedgerEntryRow['originKind'];
  originRef: string | null;
  overriddenKind: LedgerEntryRow['originKind'] | null;
  overriddenRef: string | null;
  projectedCents: bigint | null;
} {
  if (origin.kind === 'OVERRIDE') {
    const original = refOf(origin.original);
    return {
      originKind: 'OVERRIDE',
      originRef: original.ref,
      overriddenKind: original.kind,
      overriddenRef: original.ref,
      projectedCents: BigInt(origin.projected.cents),
    };
  }

  const { kind, ref } = refOf(origin);
  return {
    originKind: kind,
    originRef: ref,
    overriddenKind: null,
    overriddenRef: null,
    projectedCents: null,
  };
}

function refOf(origin: EntryOrigin): {
  kind: LedgerEntryRow['originKind'];
  ref: string | null;
} {
  switch (origin.kind) {
    case 'FROM_TEMPLATE':
      return { kind: 'FROM_TEMPLATE', ref: origin.templateId };
    case 'FROM_ALLOCATION':
      return { kind: 'FROM_ALLOCATION', ref: origin.bucketId };
    default:
      return { kind: 'MANUAL', ref: null };
  }
}

export function toLedgerEntry(row: LedgerEntryRow): LedgerEntry {
  const entry = LedgerEntry.create({
    id: row.id,
    description: row.description,
    kind: row.kind,
    dueDate: LocalDate.fromInstant(row.dueDate),
    planned: Money.fromCents(Number(row.plannedCents)),
    isEstimate: row.isEstimate,
    origin: toOrigin(row),
  });

  return applyStoredSettlement(entry, row);
}

/**
 * Replays the stored settlement. `create` always produces a pending entry, so
 * a paid one has to be settled again on the way out of the database.
 */
function applyStoredSettlement(
  entry: LedgerEntry,
  row: LedgerEntryRow,
): LedgerEntry {
  const status = row.status;
  switch (status) {
    case 'PAID':
    case 'RECEIVED':
      return entry.settle(
        Money.fromCents(Number(row.actualCents ?? row.plannedCents)),
        status,
      );
    case 'SKIPPED':
      return entry.skip();
    case 'OVERDUE':
      return entry.markOverdue();
    default:
      return entry;
  }
}

export function fromLedgerEntry(
  entry: LedgerEntry,
  cycleId: string,
): Omit<LedgerEntryRow, 'createdAt' | 'updatedAt'> {
  return {
    id: entry.id,
    cycleId,
    description: entry.description,
    dueDate: new Date(`${entry.dueDate.toISO()}T00:00:00.000Z`),
    kind: entry.kind,
    plannedCents: BigInt(entry.amount.planned.cents),
    actualCents:
      entry.amount.actual === undefined
        ? null
        : BigInt(entry.amount.actual.cents),
    status: entry.status,
    isEstimate: entry.isEstimate,
    ...fromOrigin(entry.origin),
  };
}

export function toCycle(row: Row, ref: CycleRef): Cycle {
  return Cycle.rehydrate({
    id: row.id,
    ref,
    status: row.status,
    openingBalance: Money.fromCents(Number(row.openingBalance)),
    entries: row.entries.map(toLedgerEntry),
  });
}
