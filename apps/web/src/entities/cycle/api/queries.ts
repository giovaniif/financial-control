import type { CycleResponse, CycleWindowResponse } from '@fin/contracts';
import { useQuery } from '@tanstack/react-query';

import { api, queryKeys } from '@/shared/api';

/** The twelve the header navigates. */
export function useCycleWindow() {
  return useQuery({
    queryKey: queryKeys.cycleWindow(),
    queryFn: () => api<CycleWindowResponse>('/cycles'),
  });
}

/** One cycle in full: the chain, the entries, the running balance. */
export function useCycle(month: string | undefined) {
  return useQuery({
    queryKey: queryKeys.cycle(month ?? ''),
    queryFn: () => api<CycleResponse>(`/cycles/${month ?? ''}`),
    enabled: month !== undefined,
  });
}
