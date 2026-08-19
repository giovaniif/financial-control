import { ShiftPolicy } from '../../domain/budgeting/cycle-ref.js';
import type { EntryKind } from '../../domain/budgeting/ledger-entry.js';
import { Direction } from '../../domain/budgeting/recurring-template.js';
import type { AllocationRule } from '../../domain/goals/bucket.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import type { LocalDate } from '../../domain/shared/local-date.js';
import type { Money } from '../../domain/shared/money.js';
import type { SettlementStatus } from '../../domain/shared/planned-actual.js';
import { SETTLEMENT_STATUS_LABELS } from '../../domain/shared/planned-actual.js';
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
      return `Dar baixa no lançamento ${change.entryId} do ciclo ${change.month} como ${SETTLEMENT_STATUS_LABELS[change.status]}, ${
        change.actual === undefined
          ? 'pelo valor planejado'
          : `por ${money(change.actual)}`
      }.`;
    case 'ADD_ENTRY':
      return `Adicionar “${change.description}” ao ciclo ${change.month} — ${ENTRY_KINDS[change.entryKind]} de ${money(change.amount)} com vencimento em ${change.dueDate.toISO()}${estimate(change.isEstimate)}.`;
    case 'REGISTER_PURCHASE':
      return `Registrar “${change.description}” de ${money(change.amount)} no cartão ${change.cardId}, comprada em ${change.purchasedOn.toISO()}, em ${
        change.installments === 1
          ? 'uma parcela'
          : `${String(change.installments)} parcelas`
      }.`;
    case 'CREATE_TEMPLATE':
      return `Criar ${change.direction === Direction.In ? 'a entrada recorrente' : 'a saída recorrente'} “${change.name}” de ${money(change.amount)} no dia ${String(change.dueDayOfMonth)}, a partir do ciclo ${change.startMonth ?? 'atual'}${
        change.endMonth === undefined ? '' : ` até o ciclo ${change.endMonth}`
      }${estimate(change.isEstimate)}.`;
    case 'CHANGE_TEMPLATE_AMOUNT':
      return `Mudar a recorrência ${change.templateId} para ${money(change.amount)} a partir do ciclo ${change.fromMonth}, ${
        change.scope === EditScope.ThisAndFuture
          ? 'neste ciclo e em todos os futuros'
          : 'somente neste ciclo'
      }.`;
    case 'CHANGE_PAYDAY_ANCHOR':
      return `Mudar o dia do pagamento para o dia ${String(change.anchorDay)}, indo para o dia útil ${
        change.shiftPolicy === ShiftPolicy.Preceding ? 'anterior' : 'seguinte'
      } quando esse dia cai em fim de semana ou feriado.`;
    case 'CREATE_GOAL_BUCKET':
      return `Criar a caixinha de meta “${change.name}” — ${describeRule(change.rule)} por ciclo rumo a ${money(change.target)} até ${change.targetDate.toISO()}, prioridade #${String(change.priority)}.`;
    case 'CREATE_ONGOING_BUCKET':
      return `Criar a caixinha contínua “${change.name}” — ${describeRule(change.rule)} por ciclo, prioridade #${String(change.priority)}.`;
    case 'CHANGE_ALLOCATION_RULE':
      return `Mudar a caixinha ${change.bucketId} para receber ${describeRule(change.rule)} por ciclo.`;
    case 'OVERRIDE_CONTRIBUTION':
      return `Colocar ${money(change.amount)} na caixinha ${change.bucketId} no ciclo ${change.month}, só desta vez.`;
    default: {
      const unhandled: never = change;
      throw new UnknownProposal(`Nada descreve ${JSON.stringify(unhandled)}.`);
    }
  }
}

/** How a kind of entry reads inside a proposal's sentence. */
const ENTRY_KINDS: Record<EntryKind, string> = {
  INCOME: 'uma entrada',
  FIXED: 'uma conta fixa',
  INVOICE: 'uma fatura',
  VARIABLE: 'um lançamento variável',
  ALLOCATION: 'uma alocação',
};

function describeRule(rule: AllocationRule): string {
  return rule.kind === 'PERCENT'
    ? `${rule.percentage.toString()} da Sobra Esperada`
    : money(rule.amount);
}

function money(amount: Money): string {
  return `R$ ${amount.toReais()}`;
}

function estimate(isEstimate: boolean): string {
  return isEstimate ? ', uma estimativa' : '';
}
