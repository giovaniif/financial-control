import type { DashboardResponse } from '@fin/contracts';
import { useQuery } from '@tanstack/react-query';

import { api, queryKeys } from '@/shared/api';

/** UC-4 — the answer to "how much will I pay, and what is left". */
export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard(),
    queryFn: () => api<DashboardResponse>('/dashboard'),
  });
}
