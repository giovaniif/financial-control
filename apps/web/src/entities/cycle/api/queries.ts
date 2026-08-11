import type { CycleResponse, CycleWindowResponse } from '@fin/contracts';
import { useQuery } from '@tanstack/react-query';

import { api, queryKeys } from '@/shared/api';
import { useEstimates } from '@/shared/model';

/** The twelve the header navigates. */
export function useCycleWindow() {
  const { estimates } = useEstimates();

  return useQuery({
    queryKey: queryKeys.cycleWindow(estimates),
    queryFn: () => api<CycleWindowResponse>(`/cycles?estimates=${estimates}`),
  });
}

/** One cycle in full: the chain, the entries, the running balance. */
export function useCycle(month: string | undefined) {
  const { estimates } = useEstimates();

  return useQuery({
    queryKey: queryKeys.cycle(month ?? '', estimates),
    queryFn: () =>
      api<CycleResponse>(`/cycles/${month ?? ''}?estimates=${estimates}`),
    enabled: month !== undefined,
  });
}
