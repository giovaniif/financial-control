import type { CardResponse, OpenCardRequest } from '@fin/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, queryKeys } from '@/shared/api';

/** UC-1.3 — the day pair is what everything downstream is derived from. */
export function useOpenCard() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (card: OpenCardRequest) =>
      api<CardResponse>('/cards', {
        method: 'POST',
        body: JSON.stringify(card),
      }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.cards() }),
        client.invalidateQueries({ queryKey: queryKeys.setup() }),
      ]);
    },
  });
}
