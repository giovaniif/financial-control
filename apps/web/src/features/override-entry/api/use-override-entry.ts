import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, queryKeys } from '@/shared/api';

/**
 * UC-3.7 — one cycle's figure, without touching the template behind it, and
 * the revert that puts the projected value back.
 */
export function useOverrideEntry(month: string, entryId: string) {
  const client = useQueryClient();
  const path = `/cycles/${month}/entries/${entryId}/override`;

  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.cycles() }),
      client.invalidateQueries({ queryKey: queryKeys.dashboard() }),
    ]);
  };

  const override = useMutation({
    mutationFn: (amount: number) =>
      api<null>(path, { method: 'PUT', body: JSON.stringify({ amount }) }),
    onSuccess: refresh,
  });

  const revert = useMutation({
    mutationFn: () => api<null>(path, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  return { override, revert };
}
