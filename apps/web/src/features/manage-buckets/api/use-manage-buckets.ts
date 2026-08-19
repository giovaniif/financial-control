import type {
  AllocationPreviewResponse,
  AllocationRuleRequest,
  BucketResponse,
} from '@fin/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, queryKeys } from '@/shared/api';

function useBucketMutation<TInput>(send: (input: TInput) => Promise<unknown>) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: send,
    onSuccess: async () => {
      // An allocation is a ledger entry, so the cycles move with the bucket.
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.buckets() }),
        client.invalidateQueries({ queryKey: queryKeys.cycles() }),
        client.invalidateQueries({ queryKey: queryKeys.dashboard() }),
        client.invalidateQueries({ queryKey: queryKeys.setup() }),
      ]);
    },
  });
}

/** UC-6.2, UC-6.3, UC-6.8, UC-7.1 — the rule, the order, the yield, archiving. */
export function useUpdateBucket(id: string) {
  return useBucketMutation(
    (change: {
      rule?: AllocationRuleRequest;
      priority?: number;
      expectedYieldPercent?: number;
      status?: 'ARCHIVED';
    }) =>
      api<BucketResponse>(`/buckets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(change),
      }),
  );
}

/** UC-6.5, UC-6.7 — an override for one cycle, and the event log's entries. */
export function useRecordBucketEvent(id: string) {
  return useBucketMutation(
    (event: {
      kind: 'YIELD' | 'CORRECTION' | 'WITHDRAWAL' | 'OVERRIDE';
      amount: number;
      date?: string;
      month?: string;
      reason?: string;
    }) =>
      api<BucketResponse>(`/buckets/${id}/events`, {
        method: 'POST',
        body: JSON.stringify(event),
      }),
  );
}

/**
 * UC-6.4 — what the rules ask for against what the cycle actually has. Read
 * before any rule is changed, so the choice is made with the effect visible.
 */
export function useAllocationPreview(month: string) {
  return useQuery({
    queryKey: queryKeys.allocationPreview(month),
    queryFn: () =>
      api<AllocationPreviewResponse>(`/cycles/${month}/allocation-preview`),
    enabled: month !== '',
  });
}
