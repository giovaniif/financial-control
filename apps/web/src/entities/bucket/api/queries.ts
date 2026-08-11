import type { BucketResponse } from '@fin/contracts';
import { useQuery } from '@tanstack/react-query';

import { api, queryKeys } from '@/shared/api';

export function useBuckets() {
  return useQuery({
    queryKey: queryKeys.buckets(),
    queryFn: () => api<BucketResponse[]>('/buckets'),
  });
}
