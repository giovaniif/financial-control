import type {
  DashboardResponse,
  WealthProjectionResponse,
} from '@fin/contracts';
import { useQuery } from '@tanstack/react-query';

import { api, queryKeys } from '@/shared/api';
import { useEstimates } from '@/shared/model';

/**
 * UC-4 — the answer to "how much will I pay, and what is left", for whichever
 * cycle the header has selected. With no month the API answers about the cycle
 * after the current one, which is what the screen opens on.
 */
export function useDashboard(month?: string) {
  const { estimates } = useEstimates();
  const params = new URLSearchParams({ estimates });
  if (month !== undefined) params.set('month', month);

  return useQuery({
    queryKey: queryKeys.dashboard(month, estimates),
    queryFn: () => api<DashboardResponse>(`/dashboard?${params.toString()}`),
  });
}

/** UC-7 — where the current rate lands in 5, 10, 20 and 30 years. */
export function useWealth(month: string | undefined) {
  const query = new URLSearchParams();
  if (month !== undefined) query.set('month', month);

  return useQuery({
    queryKey: queryKeys.wealth(month),
    queryFn: () => api<WealthProjectionResponse>(`/wealth?${query.toString()}`),
  });
}
