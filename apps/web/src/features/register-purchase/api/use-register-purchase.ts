import type {
  BillingPreviewResponse,
  CardResponse,
  RegisterPurchaseRequest,
} from '@fin/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, queryKeys } from '@/shared/api';

/**
 * UC-5.4 — which invoice a purchase lands on comes from the card's closing
 * day, so it is asked for rather than worked out in the browser. A purchase
 * one day after closing shifts an entire cycle.
 */
export function useBillingPreview(cardId: string, purchasedOn: string) {
  return useQuery({
    queryKey: queryKeys.billingPreview(cardId, purchasedOn),
    queryFn: () =>
      api<BillingPreviewResponse>(
        `/cards/${cardId}/billing-preview?purchasedOn=${purchasedOn}`,
      ),
    enabled: purchasedOn !== '',
  });
}

/** UC-5.1, UC-5.2, UC-5.7 — a purchase, its instalments, and a refund. */
export function useRegisterPurchase(cardId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({
      isRefund,
      ...purchase
    }: RegisterPurchaseRequest & { isRefund: boolean }) =>
      api<CardResponse>(
        `/cards/${cardId}/${isRefund ? 'refunds' : 'purchases'}`,
        { method: 'POST', body: JSON.stringify(purchase) },
      ),
    onSuccess: async () => {
      // An invoice becomes a ledger entry in the cycle that pays it, so the
      // cycles and the dashboard move with the card.
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.cards() }),
        client.invalidateQueries({ queryKey: queryKeys.cycles() }),
        client.invalidateQueries({ queryKey: queryKeys.dashboard() }),
      ]);
    },
  });
}
