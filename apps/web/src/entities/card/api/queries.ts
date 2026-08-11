import type { CardResponse } from '@fin/contracts';
import { useQuery } from '@tanstack/react-query';

import { api, queryKeys } from '@/shared/api';

export function useCards() {
  return useQuery({
    queryKey: queryKeys.cards(),
    queryFn: () => api<CardResponse[]>('/cards'),
  });
}
