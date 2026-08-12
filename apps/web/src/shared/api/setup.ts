import type { SetupStateResponse } from '@fin/contracts';
import { useQuery } from '@tanstack/react-query';

import { api } from './client.js';
import { queryKeys } from './query-keys.js';

/** UC-1.5 — what the first run still has to do. */
export function useSetupState() {
  return useQuery({
    queryKey: queryKeys.setup(),
    queryFn: () => api<SetupStateResponse>('/setup'),
  });
}
