import type { SettleEntryRequest } from '@fin/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, queryKeys } from '@/shared/api';

interface Settle {
  month: string;
  entryId: string;
  status: SettleEntryRequest['status'];
  actual?: number;
}

/**
 * UC-3.5 — the most repeated action in the app. Omitting the actual amount
 * settles at the planned one, which is the one-click case.
 */
export function useSettleEntry() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ month, entryId, status, actual }: Settle) =>
      api<null>(`/cycles/${month}/entries/${entryId}/settle`, {
        method: 'POST',
        body: JSON.stringify({
          status,
          ...(actual === undefined ? {} : { actual }),
        }),
      }),
    onSuccess: async () => {
      // The chain, the running balance, the dashboard and the window all
      // move when one entry settles.
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.cycles() }),
        client.invalidateQueries({ queryKey: queryKeys.dashboard() }),
      ]);
    },
  });
}
