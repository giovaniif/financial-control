import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, queryKeys } from '@/shared/api';

interface Revert {
  month: string;
  entryId: string;
}

/**
 * UC-3.7 — puts back exactly what the template projected, in one action.
 *
 * DELETE on the same path PUT sets the override on: set it, remove it. The
 * server keeps the projected figure precisely so this can restore it, so
 * nothing needs to be sent.
 */
export function useRevertOverride() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ month, entryId }: Revert) =>
      api<null>(`/cycles/${month}/entries/${entryId}/override`, {
        method: 'DELETE',
      }),
    onSuccess: async () => {
      // One entry's figure moves the chain, the running balance and every
      // closing balance after it.
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.cycles() }),
        client.invalidateQueries({ queryKey: queryKeys.dashboard() }),
      ]);
    },
  });
}
