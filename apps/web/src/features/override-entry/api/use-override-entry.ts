import type { OverrideEntryRequest } from '@fin/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, queryKeys } from '@/shared/api';

interface Override {
  month: string;
  entryId: string;
  /** Signed, as the ledger signs it: money going out is negative. */
  amount: number;
}

/**
 * UC-3.7 — what this cycle expects, changed without touching whatever
 * generated it. The template keeps its own figure and every other cycle
 * keeps the projection, which is the whole difference between this and
 * editing the recurring bill.
 */
export function useOverrideEntry() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ month, entryId, amount }: Override) =>
      api<null>(`/cycles/${month}/entries/${entryId}/override`, {
        method: 'POST',
        body: JSON.stringify({ amount } satisfies OverrideEntryRequest),
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
