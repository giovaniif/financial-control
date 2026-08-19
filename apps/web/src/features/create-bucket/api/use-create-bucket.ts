import type {
  BucketResponse,
  CreateGoalRequest,
  CreateOngoingRequest,
} from '@fin/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, queryKeys } from '@/shared/api';

type CreateBucketRequest =
  | ({ mode: 'GOAL' } & CreateGoalRequest)
  | ({ mode: 'ONGOING' } & CreateOngoingRequest);

/** UC-6.1 — the mode is an invariant, so it travels with the request. */
export function useCreateBucket() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (bucket: CreateBucketRequest) =>
      api<BucketResponse>('/buckets', {
        method: 'POST',
        body: JSON.stringify(bucket),
      }),
    onSuccess: async () => {
      // A new rule takes a share of every future cycle's Expected Surplus.
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.buckets() }),
        client.invalidateQueries({ queryKey: queryKeys.cycles() }),
        client.invalidateQueries({ queryKey: queryKeys.dashboard() }),
        client.invalidateQueries({ queryKey: queryKeys.setup() }),
      ]);
    },
  });
}

export type { CreateBucketRequest };
