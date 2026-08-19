import type {
  AnchorChangePreviewResponse,
  AnchorChangeRequest,
  AnchorSettingsResponse,
} from '@fin/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, queryKeys } from '@/shared/api';

/** UC-1.1 — what the change would do, before it does it. */
export function usePreviewAnchorChange() {
  return useMutation({
    mutationFn: (change: AnchorChangeRequest) =>
      api<AnchorChangePreviewResponse>('/settings/anchor/preview', {
        method: 'POST',
        body: JSON.stringify(change),
      }),
  });
}

export function useChangeAnchor() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (change: AnchorChangeRequest) =>
      api<AnchorSettingsResponse>('/settings/anchor', {
        method: 'PUT',
        body: JSON.stringify(change),
      }),
    onSuccess: async () => {
      // The anchor decides where every cycle starts, so everything moves.
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.anchor() }),
        client.invalidateQueries({ queryKey: queryKeys.cycles() }),
        client.invalidateQueries({ queryKey: queryKeys.dashboard() }),
        client.invalidateQueries({ queryKey: queryKeys.setup() }),
      ]);
    },
  });
}
