import type { AddEntryRequest } from '@fin/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, queryKeys } from '@/shared/api';

/** UC-3.4 — a one-off in or out that no template covers. */
export function useAddEntry(month: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (entry: AddEntryRequest) =>
      api<{ id: string }>(`/cycles/${month}/entries`, {
        method: 'POST',
        body: JSON.stringify(entry),
      }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.cycles() }),
        client.invalidateQueries({ queryKey: queryKeys.dashboard() }),
      ]);
    },
  });
}
