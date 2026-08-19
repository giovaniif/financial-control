import { Badge, Button } from '@/shared/ui';

import { useApplyProposal } from '../api/use-apply-proposal.js';
import type { OfferedProposal } from '../model/conversation.js';
import { explainApplyFailure } from '../model/apply-failure.js';
import {
  describeCycle,
  describeProposal,
  inAppTerms,
} from '../model/proposal-copy.js';

interface Props {
  offered: OfferedProposal;
  onApplied: (proposalId: string) => void;
  onDismiss: (proposalId: string) => void;
}

/**
 * UC-8.3 — a change shown as what it will do, in the app's own formatting and
 * naming the cycle it lands in. The assistant never makes the change: this is
 * where the user does, and dismissing writes nothing at all.
 */
export function ProposalCard({ offered, onApplied, onDismiss }: Props) {
  const apply = useApplyProposal();
  const { proposal, isApplied } = offered;
  const { label } = describeProposal(proposal.kind);
  const cycle = describeCycle(proposal.kind, proposal.summary);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-300 bg-zinc-50 p-3">
      <div className="flex items-center gap-2">
        <Badge tone="info">{label}</Badge>
        {isApplied && <Badge tone="positive">Aplicado</Badge>}
      </div>

      <p className="text-sm text-zinc-900">{inAppTerms(proposal.summary)}</p>

      {cycle !== null && <p className="text-xs text-zinc-500">{cycle}</p>}

      {!isApplied && (
        <div className="flex gap-2">
          <Button
            variant="primary"
            disabled={apply.isPending}
            onClick={() => {
              apply.mutate(
                { id: proposal.id, summary: proposal.summary },
                {
                  onSuccess: () => {
                    onApplied(proposal.id);
                  },
                },
              );
            }}
          >
            Confirmar
          </Button>
          {/* Nothing is written here, and nothing is asked of the server. */}
          <Button
            onClick={() => {
              onDismiss(proposal.id);
            }}
          >
            Descartar
          </Button>
        </div>
      )}

      {apply.isError && (
        <p role="alert" className="text-sm text-red-700">
          {explainApplyFailure(apply.error)}
        </p>
      )}
    </div>
  );
}
