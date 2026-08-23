import type { AllocationRule } from '../../domain/goals/bucket.js';

import type {
  DraftAccount,
  DraftBill,
  DraftBucket,
  DraftRecord,
  SetupDraft,
} from './setup-draft.js';
import { SetupRecordNotFound } from './setup-draft.js';

/**
 * One thing the setup established: the sentence it is shown as, and the record
 * behind it.
 *
 * Both are read off the same {@link DraftRecord}, which is the point — FIN-124.
 * A sentence is written for a person, and a client that had to read the fields
 * back out of one would stop working the day the wording changed, with nothing
 * on either side of the wire to say so.
 *
 * The section is the tag, exactly as it is on `DraftRecord`, so a card's fields
 * cannot be read off a bucket. The two sections holding a single value — the
 * anchor and the salary — carry no record at all: they are answered again
 * rather than corrected, so there is nothing for an editor to pre-fill.
 */
export type EstablishedRecord =
  | {
      readonly section: 'ANCHOR' | 'SALARY';
      readonly id: undefined;
      readonly summary: string;
    }
  | (DraftRecord & { readonly id: string; readonly summary: string });

/** What one of the single-value sections established, which has no fields. */
export function establishedValue(
  section: 'ANCHOR' | 'SALARY',
  summary: string,
): EstablishedRecord {
  return { section, id: undefined, summary };
}

export function establishedOf(held: DraftRecord): EstablishedRecord {
  return { ...held, id: held.record.id, summary: summariseRecord(held) };
}

/**
 * The record `after` holds and `before` did not. The draft issues the id, so
 * this is where a turn learns what a later correction has to name.
 */
export function establishedIn(
  before: SetupDraft,
  after: SetupDraft,
): EstablishedRecord {
  const known = new Set(before.records.map((held) => held.record.id));
  const added = after.records.find((held) => !known.has(held.record.id));
  if (added === undefined) {
    throw new SetupRecordNotFound('Nada de novo foi registrado.');
  }

  return establishedOf(added);
}

/** The record as the user is shown it, in the app's own formatting. */
export function summariseRecord(held: DraftRecord): string {
  switch (held.section) {
    case 'ACCOUNTS':
      return summariseAccount(held.record);
    case 'FIXED_BILLS':
    case 'VARIABLE_BILLS':
      return summariseBill(held.record);
    case 'BUCKETS':
      return summariseBucket(held.record);
    default: {
      const unreachable: never = held;
      return unreachable;
    }
  }
}

function describeRule(rule: AllocationRule): string {
  return rule.kind === 'PERCENT'
    ? `${rule.percentage.toString()} da Sobra Esperada`
    : `R$ ${rule.amount.toReais()}`;
}

const ACCOUNT_TYPES: Record<DraftAccount['type'], string> = {
  CHECKING: 'uma conta corrente',
  SAVINGS: 'uma conta poupança',
  CASH: 'dinheiro em espécie',
};

function summariseAccount(account: DraftAccount): string {
  return `${account.name} — ${ACCOUNT_TYPES[account.type]} com R$ ${account.balance.toReais()}.`;
}

function summariseBill(bill: DraftBill): string {
  return `${bill.name} — R$ ${bill.amount.abs().toReais()} no dia ${String(bill.dueDayOfMonth)}${bill.isEstimate ? ', uma estimativa' : ''}.`;
}

function summariseBucket(bucket: DraftBucket): string {
  const opening = `${bucket.name} — ${describeRule(bucket.rule)} por ciclo`;
  const order = `prioridade #${String(bucket.priority)}.`;

  return bucket.mode === 'GOAL'
    ? `${opening} rumo a R$ ${bucket.target.amount.toReais()} até ${bucket.target.date.toISO()}, ${order}`
    : `${opening}, ${order}`;
}
