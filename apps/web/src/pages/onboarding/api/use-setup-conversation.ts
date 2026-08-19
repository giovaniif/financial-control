import type {
  SetupAppliedResponse,
  SetupTurnRequest,
  SetupTurnResponse,
} from '@fin/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, queryKeys } from '@/shared/api';

/**
 * One turn of the setup conversation. The transcript itself never travels:
 * the server holds it, and the client carries only the id it was handed back.
 */
export function useSetupTurn() {
  return useMutation({
    mutationFn: (request: SetupTurnRequest) =>
      api<SetupTurnResponse>('/setup/conversation', {
        method: 'POST',
        body: JSON.stringify(request),
      }),
  });
}

/**
 * The first and only moment the conversation writes anything — UC-1.5. Until
 * this runs there is no half-finished setup to clean up, which is why every
 * screen the new data lands on is invalidated here and nowhere earlier.
 */
export function useApplySetup() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (conversationId: string) =>
      api<SetupAppliedResponse>(`/setup/conversation/${conversationId}/apply`, {
        method: 'POST',
      }),
    onSuccess: async () => {
      await Promise.all(
        [
          queryKeys.setup(),
          queryKeys.accounts(),
          queryKeys.templates(),
          queryKeys.cards(),
          queryKeys.buckets(),
          queryKeys.cycles(),
          queryKeys.dashboard(),
          queryKeys.anchor(),
        ].map((queryKey) => client.invalidateQueries({ queryKey })),
      );
    },
  });
}
