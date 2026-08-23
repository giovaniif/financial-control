import type { AccountType } from '../../domain/budgeting/account.js';
import type {
  AllocationRule,
  BucketTarget,
} from '../../domain/goals/bucket.js';
import type { LocalDate } from '../../domain/shared/local-date.js';
import type { Money } from '../../domain/shared/money.js';

import type {
  DraftRecord,
  ProposedBucket,
  ProposedGoalBucket,
  SetupDraft,
} from './setup-draft.js';
import { SetupSection } from './setup-draft.js';

/**
 * What is being changed about one record the setup holds, in the domain's own
 * types.
 *
 * There are two ways in and they meet here: the model's `correct_record` tool
 * call, and the structured route a form posts (FIN-122). Reading the two into
 * one shape is what makes a corrected due day refused identically on both —
 * the merge and the validation happen once, no matter who asked.
 *
 * Every field is optional because a correction states only what changes; the
 * rest is read off the record it names.
 */
export interface RecordCorrection {
  readonly name?: string | undefined;
  readonly type?: AccountType | undefined;
  readonly balance?: Money | undefined;
  readonly amount?: Money | undefined;
  readonly dueDayOfMonth?: number | undefined;
  readonly isEstimate?: boolean | undefined;
  readonly limit?: Money | undefined;
  readonly closingDay?: number | undefined;
  readonly dueDay?: number | undefined;
  readonly paymentAccountName?: string | undefined;
  readonly rule?: AllocationRule | undefined;
  readonly targetAmount?: Money | undefined;
  readonly targetDate?: LocalDate | undefined;
}

export interface CorrectedRecord {
  readonly draft: SetupDraft;
  readonly summary: string;
}

/**
 * The stated fields are merged onto the record they name and the whole thing
 * is offered to the draft again, which validates a correction exactly as it
 * validates an addition. A field belonging to another kind of record is not
 * read: the corrected record is read back to the user, so what did not apply
 * is visible rather than silent.
 *
 * `undefined` means nothing that applies was stated — a question, not a
 * correction that changes nothing.
 */
export function applyCorrection(
  draft: SetupDraft,
  id: string,
  held: DraftRecord,
  correction: RecordCorrection,
): CorrectedRecord | undefined {
  const { name } = correction;

  switch (held.section) {
    case 'ACCOUNTS': {
      const { type, balance } = correction;
      if (name === undefined && type === undefined && balance === undefined) {
        return undefined;
      }

      const account = {
        name: name ?? held.record.name,
        type: type ?? held.record.type,
        balance: balance ?? held.record.balance,
      };

      return {
        draft: draft.replaceAccount(id, account),
        summary: summariseAccount(account),
      };
    }
    case 'FIXED_BILLS':
    case 'VARIABLE_BILLS': {
      const { amount, dueDayOfMonth, isEstimate } = correction;
      if (
        name === undefined &&
        amount === undefined &&
        dueDayOfMonth === undefined &&
        isEstimate === undefined
      ) {
        return undefined;
      }

      const bill = {
        name: name ?? held.record.name,
        amount: amount ?? held.record.amount,
        dueDayOfMonth: dueDayOfMonth ?? held.record.dueDayOfMonth,
        isEstimate: isEstimate ?? held.record.isEstimate,
      };

      return {
        draft:
          held.section === SetupSection.FixedBills
            ? draft.replaceFixedBill(id, bill)
            : draft.replaceVariableBill(id, bill),
        summary: summariseBill(bill),
      };
    }
    case 'CARDS': {
      const { limit, closingDay, dueDay, paymentAccountName } = correction;
      if (
        name === undefined &&
        limit === undefined &&
        closingDay === undefined &&
        dueDay === undefined &&
        paymentAccountName === undefined
      ) {
        return undefined;
      }

      const card = {
        name: name ?? held.record.name,
        limit: limit ?? held.record.limit,
        closingDay: closingDay ?? held.record.closingDay,
        dueDay: dueDay ?? held.record.dueDay,
        paymentAccountName:
          paymentAccountName ?? held.record.paymentAccountName,
      };

      return {
        draft: draft.replaceCard(id, card),
        summary: summariseCard(card),
      };
    }
    case 'BUCKETS': {
      const { rule, targetAmount, targetDate } = correction;
      const bucket = held.record;
      const base = {
        name: name ?? bucket.name,
        rule: rule ?? bucket.rule,
        // The funding order is the draft's to hand out, not a correction's to
        // take: changing it would renumber a bucket nobody mentioned.
        priority: bucket.priority,
      };

      if (bucket.mode === 'ONGOING') {
        if (name === undefined && rule === undefined) return undefined;

        return {
          draft: draft.replaceOngoingBucket(id, base),
          summary: summariseBucket({ mode: 'ONGOING', ...base }),
        };
      }

      if (
        name === undefined &&
        rule === undefined &&
        targetAmount === undefined &&
        targetDate === undefined
      ) {
        return undefined;
      }

      const goal = {
        ...base,
        target: {
          amount: targetAmount ?? bucket.target.amount,
          date: targetDate ?? bucket.target.date,
        } satisfies BucketTarget,
      };

      return {
        draft: draft.replaceGoalBucket(id, goal),
        summary: summariseBucket({ mode: 'GOAL', ...goal }),
      };
    }
    default: {
      const unreachable: never = held;
      return unreachable;
    }
  }
}

export function summariseAccount(account: {
  name: string;
  type: AccountType;
  balance: Money;
}): string {
  return `${account.name} — a ${account.type.toLowerCase()} account holding R$ ${account.balance.toReais()}.`;
}

export function summariseBill(bill: {
  name: string;
  amount: Money;
  dueDayOfMonth: number;
  isEstimate: boolean;
}): string {
  return `${bill.name} — R$ ${bill.amount.abs().toReais()} on day ${String(bill.dueDayOfMonth)}${bill.isEstimate ? ', an estimate' : ''}.`;
}

export function summariseCard(card: {
  name: string;
  limit: Money;
  closingDay: number;
  dueDay: number;
  paymentAccountName: string;
}): string {
  return `${card.name} — limit R$ ${card.limit.toReais()}, closing on day ${String(card.closingDay)}, due on day ${String(card.dueDay)}, paid from ${card.paymentAccountName}.`;
}

/** The two shapes a bucket has, with the id the draft has yet to give it. */
export type SummarisedBucket =
  | ({ readonly mode: 'GOAL' } & ProposedGoalBucket)
  | ({ readonly mode: 'ONGOING' } & ProposedBucket);

export function summariseBucket(bucket: SummarisedBucket): string {
  const opening = `${bucket.name} — ${describeRule(bucket.rule)} each cycle`;
  const order = `funded #${String(bucket.priority)}.`;

  return bucket.mode === 'GOAL'
    ? `${opening} toward R$ ${bucket.target.amount.toReais()} by ${bucket.target.date.toISO()}, ${order}`
    : `${opening}, ${order}`;
}

export function describeRule(rule: AllocationRule): string {
  return rule.kind === 'PERCENT'
    ? `${rule.percentage.toString()} of Expected Surplus`
    : `R$ ${rule.amount.toReais()}`;
}
