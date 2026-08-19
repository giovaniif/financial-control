import type { ReopenPreviewResponse } from '@fin/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, queryKeys } from '@/shared/api';

async function refreshEverything(client: {
  invalidateQueries: (filter: {
    queryKey: readonly unknown[];
  }) => Promise<void>;
}) {
  await Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.cycles() }),
    client.invalidateQueries({ queryKey: queryKeys.dashboard() }),
  ]);
}

/** UC-3.8 — freezing a cycle and chaining its closing balance forward. */
export function useCloseCycle(month: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () => api<null>(`/cycles/${month}/close`, { method: 'POST' }),
    onSuccess: () => refreshEverything(client),
  });
}

/**
 * UC-3.9 — what reopening would do, fetched before anything is written. The
 * query is disabled until asked for: this is a warning, not a page load.
 */
export function useReopenPreview(month: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.reopenPreview(month),
    queryFn: () =>
      api<ReopenPreviewResponse>(`/cycles/${month}/reopen-preview`),
    enabled,
  });
}

export function useReopenCycle(month: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api<ReopenPreviewResponse>(`/cycles/${month}/reopen`, { method: 'POST' }),
    onSuccess: () => refreshEverything(client),
  });
}
