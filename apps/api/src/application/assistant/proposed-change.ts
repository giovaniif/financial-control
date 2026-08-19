import { ShiftPolicy } from '../../domain/budgeting/cycle-ref.js';
import type { EntryKind } from '../../domain/budgeting/ledger-entry.js';
import { Direction } from '../../domain/budgeting/recurring-template.js';
import type { AllocationRule } from '../../domain/goals/bucket.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import type { LocalDate } from '../../domain/shared/local-date.js';
import type { Money } from '../../domain/shared/money.js';
import type { SettlementStatus } from '../../domain/shared/planned-actual.js';
import { EditScope } from '../budgeting/uc-2-manage-templates.js';

export class UnknownProposal extends DomainError {}

/**
 * The three ways an entry can be resolved. `PENDING` and `OVERDUE` are states
 * an entry arrives in, not things anyone asks for, so they cannot be proposed.
 */
export type ProposedSettlement =
  | typeof SettlementStatus.Paid
  | typeof SettlementStatus.Received
  | typeof SettlementStatus.Skipped;

/**
 * A change the assistant suggests — **a statement of intent, never a change**.
 *
 * Every variant carries exactly what the interactor behind it needs and
 * nothing else: no display names the model would have to be trusted for, and
 * no figures worked out here. Applying one routes into the use case that
 * already implements it, so every invariant stays enforced where the domain
 * tests already defend it (`docs/DOMAIN_MODEL.md` §6).
 *
 * Consumers switch exhaustively with a `never` default, so adding a kind
 * breaks the build everywhere it has to be handled.
 */
export type ProposedChange =
  /** UC-3.5 */
  | {
      readonly kind: 'SETTLE_ENTRY';
      readonly month: string;
      readonly entryId: string;
      readonly status: ProposedSettlement;
      /** Absent settles at the planned amount, which is the common case. */
      readonly actual: Money | undefined;
    }
  /** UC-3.4 */
  | {
      readonly kind: 'ADD_ENTRY';
      readonly month: string;
      readonly description: string;
      readonly entryKind: EntryKind;
      readonly dueDate: LocalDate;
      readonly amount: Money;
      readonly isEstimate: boolean;
    }
  /** UC-5.1, UC-5.2 */
  | {
      readonly kind: 'REGISTER_PURCHASE';
      readonly cardId: string;
      readonly description: string;
      readonly purchasedOn: LocalDate;
      readonly amount: Money;
      readonly installments: number;
    }
  /** UC-2.1, UC-2.2 */
  | {
      readonly kind: 'CREATE_TEMPLATE';
      readonly name: string;
      readonly direction: Direction;
      readonly dueDayOfMonth: number;
      readonly amount: Money;
      /** Absent starts it in the cycle the app is currently in. */
      readonly startMonth: string | undefined;
      readonly endMonth: string | undefined;
      readonly isEstimate: boolean;
    }
  /** UC-2.3 */
  | {
      readonly kind: 'CHANGE_TEMPLATE_AMOUNT';
      readonly templateId: string;
      readonly fromMonth: string;
      readonly amount: Money;
      readonly scope: EditScope;
    }
  /** UC-1.1 */
  | {
      readonly kind: 'CHANGE_PAYDAY_ANCHOR';
      readonly anchorDay: number;
      readonly shiftPolicy: ShiftPolicy;
    }
  /** UC-6.1 — a goal and an ongoing bucket are separate kinds because the
   * mode is a real invariant: a goal has a target and a date, an ongoing one
   * has neither, and neither can be expressed as the other with a field left
   * blank. */
  | {
      readonly kind: 'CREATE_GOAL_BUCKET';
      readonly name: string;
      readonly target: Money;
      readonly targetDate: LocalDate;
      readonly rule: AllocationRule;
      readonly priority: number;
    }
  | {
      readonly kind: 'CREATE_ONGOING_BUCKET';
      readonly name: string;
      readonly rule: AllocationRule;
      readonly priority: number;
    }
  /** UC-6.2 */
  | {
      readonly kind: 'CHANGE_ALLOCATION_RULE';
      readonly bucketId: string;
      readonly rule: AllocationRule;
    }
  /** UC-6.5 */
  | {
      readonly kind: 'OVERRIDE_CONTRIBUTION';
      readonly bucketId: string;
      readonly month: string;
      readonly amount: Money;
    };

/**
 * The proposal in one sentence, in the app's own formatting.
 *
 * It is what the user is shown and what the confirmation echoes back, so it
 * has to name **every** field that would be written: two proposals that would
 * write different things must never read the same, or one could be swapped
 * for the other between the render and the apply.
 */
export function summarise(change: ProposedChange): string {
  switch (change.kind) {
    case 'SETTLE_ENTRY':
      return `Settle entry ${change.entryId} in the ${change.month} cycle as ${change.status.toLowerCase()}, at ${
        change.actual === undefined
          ? 'its planned amount'
          : money(change.actual)
      }.`;
    case 'ADD_ENTRY':
      return `Add “${change.description}” to the ${change.month} cycle — a ${change.entryKind.toLowerCase()} of ${money(change.amount)} due on ${change.dueDate.toISO()}${estimate(change.isEstimate)}.`;
    case 'REGISTER_PURCHASE':
      return `Register “${change.description}” of ${money(change.amount)} on card ${change.cardId}, bought on ${change.purchasedOn.toISO()}, in ${
        change.installments === 1
          ? 'one payment'
          : `${String(change.installments)} instalments`
      }.`;
    case 'CREATE_TEMPLATE':
      return `Create the recurring ${change.direction === Direction.In ? 'income' : 'outcome'} “${change.name}” of ${money(change.amount)} on day ${String(change.dueDayOfMonth)}, from the ${change.startMonth ?? 'current'} cycle${
        change.endMonth === undefined
          ? ''
          : ` until the ${change.endMonth} cycle`
      }${estimate(change.isEstimate)}.`;
    case 'CHANGE_TEMPLATE_AMOUNT':
      return `Change template ${change.templateId} to ${money(change.amount)} from the ${change.fromMonth} cycle, ${
        change.scope === EditScope.ThisAndFuture
          ? 'this cycle and every future one'
          : 'this cycle only'
      }.`;
    case 'CHANGE_PAYDAY_ANCHOR':
      return `Move the payday anchor to day ${String(change.anchorDay)}, taking the ${
        change.shiftPolicy === ShiftPolicy.Preceding ? 'preceding' : 'following'
      } business day when that one is closed.`;
    case 'CREATE_GOAL_BUCKET':
      return `Create the goal bucket “${change.name}” — ${describeRule(change.rule)} each cycle toward ${money(change.target)} by ${change.targetDate.toISO()}, funded #${String(change.priority)}.`;
    case 'CREATE_ONGOING_BUCKET':
      return `Create the ongoing bucket “${change.name}” — ${describeRule(change.rule)} each cycle, funded #${String(change.priority)}.`;
    case 'CHANGE_ALLOCATION_RULE':
      return `Change bucket ${change.bucketId} to take ${describeRule(change.rule)} each cycle.`;
    case 'OVERRIDE_CONTRIBUTION':
      return `Put ${money(change.amount)} into bucket ${change.bucketId} for the ${change.month} cycle, this once.`;
    default: {
      const unhandled: never = change;
      throw new UnknownProposal(
        `Nothing describes ${JSON.stringify(unhandled)}.`,
      );
    }
  }
}

function describeRule(rule: AllocationRule): string {
  return rule.kind === 'PERCENT'
    ? `${rule.percentage.toString()} of Expected Surplus`
    : money(rule.amount);
}

function money(amount: Money): string {
  return `R$ ${amount.toReais()}`;
}

function estimate(isEstimate: boolean): string {
  return isEstimate ? ', an estimate' : '';
}
