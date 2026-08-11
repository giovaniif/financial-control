import type { AccountsResponse } from '@fin/contracts';
import { useQuery } from '@tanstack/react-query';

import { api, queryKeys } from '@/shared/api';

/** The sidebar's "In accounts now", summed server-side. */
export function useAccounts() {
  return useQuery({
    queryKey: queryKeys.accounts(),
    queryFn: () => api<AccountsResponse>('/accounts'),
  });
}
