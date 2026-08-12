import type {
  DashboardResponse,
  WealthProjectionResponse,
} from '@fin/contracts';
import { useQuery } from '@tanstack/react-query';

import { api, queryKeys } from '@/shared/api';

/**
 * UC-4 — the answer to "how much will I pay, and what is left", for whichever
 * cycle the header has selected. With no month the API answers about the cycle
 * after the current one, which is what the screen opens on.
 */
export function useDashboard(month?: string) {
  const query = month === undefined ? '' : `?month=${month}`;

  return useQuery({
    queryKey: queryKeys.dashboard(month),
    queryFn: () => api<DashboardResponse>(`/dashboard${query}`),
  });
}

/** UC-7 — where the current rate lands in 5, 10, 20 and 30 years. */
export function useWealth(month: string | undefined, yields?: string) {
  const query = new URLSearchParams();
  if (month !== undefined) query.set('month', month);
  if (yields !== undefined && yields !== '') query.set('yields', yields);

  return useQuery({
    queryKey: queryKeys.wealth(month, yields),
    queryFn: () => api<WealthProjectionResponse>(`/wealth?${query.toString()}`),
  });
}
