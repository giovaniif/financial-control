import type { HealthResponse } from '@fin/contracts';
import { useQuery } from '@tanstack/react-query';

import { api } from './client.js';
import { queryKeys } from './query-keys.js';

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health(),
    queryFn: () => api<HealthResponse>('/health'),
  });
}
