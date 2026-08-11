import type { CardResponse } from '@fin/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, queryKeys } from '@/shared/api';

function useCardMutation<TInput>(send: (input: TInput) => Promise<unknown>) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: send,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.cards() }),
        client.invalidateQueries({ queryKey: queryKeys.cycles() }),
        client.invalidateQueries({ queryKey: queryKeys.dashboard() }),
      ]);
    },
  });
}

/** UC-5.5 — settling an invoice from the account that pays it. */
export function usePayInvoice(cardId: string, invoiceId: string) {
  return useCardMutation((amount: number) =>
    api<CardResponse>(`/cards/${cardId}/invoices/${invoiceId}/pay`, {
      method: 'POST',
      body: JSON.stringify({ amount }),
    }),
  );
}

/** UC-5.6 — anticipating the remaining instalments, with a discount. */
export function usePayOffEarly(cardId: string) {
  return useCardMutation((input: { purchaseId: string; discount?: number }) =>
    api<CardResponse>(`/cards/${cardId}/pay-off-early`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
}
