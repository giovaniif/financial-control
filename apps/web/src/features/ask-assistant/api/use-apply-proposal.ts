import type {
  ProposalAppliedResponse,
  ProposalConfirmationRequest,
} from '@fin/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, queryKeys } from '@/shared/api';

interface Confirmation {
  id: string;
  /** The sentence the user was shown, word for word. */
  summary: string;
}

/**
 * UC-8.3 — the moment a proposal becomes a change. It runs the same operation
 * a screen would, so everything it can touch is invalidated together: a
 * confirmed change that moved the closing balance must not leave the figure
 * beside it reading the old one.
 */
export function useApplyProposal() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, summary }: Confirmation) =>
      api<ProposalAppliedResponse>(`/assistant/proposals/${id}/apply`, {
        method: 'POST',
        body: JSON.stringify({ summary } satisfies ProposalConfirmationRequest),
      }),
    onSuccess: async () => {
      await Promise.all(
        [
          queryKeys.dashboard(),
          queryKeys.cycles(),
          queryKeys.buckets(),
          queryKeys.templates(),
          queryKeys.cards(),
          queryKeys.accounts(),
          queryKeys.anchor(),
        ].map((queryKey) => client.invalidateQueries({ queryKey })),
      );
    },
  });
}
