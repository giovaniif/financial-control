import type { AllocationRule } from '../../domain/goals/bucket.js';
import type { Clock } from '../../domain/ports/clock.js';
import type { ProposalStore } from '../../domain/ports/proposal-store.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import type { Principal } from '../../domain/shared/principal.js';
import { SettlementStatus } from '../../domain/shared/planned-actual.js';
import type { ConfigurePaydayAnchor } from '../budgeting/uc-1-1-configure-payday-anchor.js';
import type { ManageTemplates } from '../budgeting/uc-2-manage-templates.js';
import type { LedgerActions } from '../budgeting/uc-3-ledger-actions.js';
import type { ManageCards } from '../cards/uc-5-manage-cards.js';
import type { ManageBuckets } from '../goals/uc-6-manage-buckets.js';

import type { ProposedChange } from './proposed-change.js';
import { summarise, UnknownProposal } from './proposed-change.js';

export class ProposalNotFound extends DomainError {}
export class ProposalMismatch extends DomainError {}
export class ProposalNotYours extends DomainError {}
export class ProposalAlreadyApplied extends DomainError {}

export type AssistantProposals = ProposalStore<ProposedChange>;

/**
 * The user saying yes to one proposal.
 *
 * It carries the sentence the proposal was rendered as, word for word, and
 * nothing else of the change: the app compares it with what it holds, so a
 * proposal cannot be swapped for another between being read and being
 * confirmed.
 */
export interface ProposalConfirmation {
  readonly proposalId: string;
  readonly summary: string;
}

export interface ProposalApplied {
  readonly proposalId: string;
  readonly kind: ProposedChange['kind'];
  readonly summary: string;
}

/**
 * UC-8.3 — the only door between a proposed change and a write.
 *
 * Every kind routes into the interactor that already implements that use
 * case, which is the whole point of the trust boundary: the model produced
 * the intent, and the domain enforces every invariant exactly where its own
 * tests already defend it. Nothing is re-checked here.
 *
 * **Validation happens now, not when the proposal was made.** A proposal is
 * built against the figures of a moment and confirmed a minute or an hour
 * later, so the interactor validates it as it would any other caller's
 * request: a proposal against data that has since moved fails cleanly rather
 * than writing something wrong.
 */
export class ApplyProposal {
  constructor(
    private readonly proposals: AssistantProposals,
    private readonly ledger: LedgerActions,
    private readonly templates: ManageTemplates,
    private readonly anchor: ConfigurePaydayAnchor,
    private readonly cards: ManageCards,
    private readonly buckets: ManageBuckets,
    private readonly clock: Clock,
  ) {}

  /**
   * The principal is a separate argument from the confirmation because it is
   * ambient: it comes from whatever knows who is calling, never from the body
   * the caller sent. Today there is one user and the check is a tautology;
   * the day there are two it is what stops one confirming a change composed
   * for the other.
   */
  async confirm(
    principal: Principal,
    confirmation: ProposalConfirmation,
  ): Promise<ProposalApplied> {
    const stored = await this.proposals.load(confirmation.proposalId);

    if (stored === undefined) {
      throw new ProposalNotFound(
        `No proposal ${confirmation.proposalId} is waiting to be confirmed.`,
      );
    }
    if (!stored.principal.equals(principal)) {
      throw new ProposalNotYours(
        `Proposal ${stored.id} was composed for somebody else.`,
      );
    }
    if (stored.appliedAt !== undefined) {
      throw new ProposalAlreadyApplied(
        `Proposal ${stored.id} has already been applied.`,
      );
    }
    if (stored.summary !== confirmation.summary) {
      throw new ProposalMismatch(
        `Proposal ${stored.id} is not the change that was confirmed. It says: ${stored.summary}`,
      );
    }

    await this.route(stored.change);
    // Only after the write: a proposal whose apply failed is still a proposal,
    // and the user can fix whatever moved and confirm the same one again.
    await this.proposals.save({ ...stored, appliedAt: this.clock.now() });

    return {
      proposalId: stored.id,
      kind: stored.change.kind,
      summary: summarise(stored.change),
    };
  }

  private async route(change: ProposedChange): Promise<void> {
    switch (change.kind) {
      case 'SETTLE_ENTRY':
        // Skipping records that no money moved, which is a different
        // operation from settling — the domain refuses to settle at a status
        // that realises nothing.
        if (change.status === SettlementStatus.Skipped) {
          await this.ledger.skip(change.month, change.entryId);
          return;
        }
        await this.ledger.settle({
          month: change.month,
          entryId: change.entryId,
          status: change.status,
          ...(change.actual === undefined
            ? {}
            : { actualCents: change.actual.cents }),
        });
        return;
      case 'ADD_ENTRY':
        await this.ledger.addEntry({
          month: change.month,
          description: change.description,
          kind: change.entryKind,
          dueDate: change.dueDate.toISO(),
          amountCents: change.amount.cents,
          isEstimate: change.isEstimate,
        });
        return;
      case 'REGISTER_PURCHASE':
        await this.cards.registerPurchase({
          cardId: change.cardId,
          description: change.description,
          purchasedOn: change.purchasedOn.toISO(),
          amountCents: change.amount.cents,
          installments: change.installments,
        });
        return;
      case 'CREATE_TEMPLATE':
        await this.templates.create({
          name: change.name,
          direction: change.direction,
          dueDayOfMonth: change.dueDayOfMonth,
          amountCents: change.amount.cents,
          ...(change.startMonth === undefined
            ? {}
            : { startMonth: change.startMonth }),
          ...(change.endMonth === undefined
            ? {}
            : { endMonth: change.endMonth }),
          isEstimate: change.isEstimate,
        });
        return;
      case 'CHANGE_TEMPLATE_AMOUNT':
        await this.templates.changeAmount({
          templateId: change.templateId,
          fromMonth: change.fromMonth,
          amountCents: change.amount.cents,
          scope: change.scope,
        });
        return;
      case 'CHANGE_PAYDAY_ANCHOR':
        await this.anchor.change({
          anchorDay: change.anchorDay,
          shiftPolicy: change.shiftPolicy,
        });
        return;
      case 'CREATE_GOAL_BUCKET':
        await this.buckets.createGoal({
          name: change.name,
          targetCents: change.target.cents,
          targetDate: change.targetDate.toISO(),
          rule: asRuleInput(change.rule),
          priority: change.priority,
        });
        return;
      case 'CREATE_ONGOING_BUCKET':
        await this.buckets.createOngoing({
          name: change.name,
          rule: asRuleInput(change.rule),
          priority: change.priority,
        });
        return;
      case 'CHANGE_ALLOCATION_RULE':
        await this.buckets.changeRule(
          change.bucketId,
          asRuleInput(change.rule),
        );
        return;
      case 'OVERRIDE_CONTRIBUTION':
        await this.buckets.overrideContribution(
          change.bucketId,
          change.month,
          change.amount.cents,
        );
        return;
      default: {
        const unhandled: never = change;
        throw new UnknownProposal(
          `Nothing applies ${JSON.stringify(unhandled)}.`,
        );
      }
    }
  }
}

function asRuleInput(
  rule: AllocationRule,
):
  | { kind: 'PERCENT'; percent: number }
  | { kind: 'FIXED'; amountCents: number } {
  return rule.kind === 'PERCENT'
    ? { kind: 'PERCENT', percent: rule.percentage.percent }
    : { kind: 'FIXED', amountCents: rule.amount.cents };
}
