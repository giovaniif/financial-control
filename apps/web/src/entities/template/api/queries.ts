import type { TemplatesResponse } from '@fin/contracts';
import { useQuery } from '@tanstack/react-query';

import { api, queryKeys } from '@/shared/api';

export function useTemplates() {
  return useQuery({
    queryKey: queryKeys.templates(),
    queryFn: () => api<TemplatesResponse>('/templates'),
  });
}
