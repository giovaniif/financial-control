import type {
  AnchorChangePreviewResponse,
  AnchorChangeRequest,
  AnchorResolveResponse,
  AnchorSettingsResponse,
} from '@fin/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, queryKeys } from '@/shared/api';

/**
 * UC-1.1 — what a proposed anchor would make the cycles look like. A read
 * despite the POST: the anchor travels in a body, and nothing is saved.
 *
 * The weekend and short-month rules live in the domain's `CycleRef`, so the
 * boundaries are asked for rather than recomputed here.
 */
export function useResolveAnchor(anchor: AnchorChangeRequest) {
  return useQuery({
    queryKey: queryKeys.anchorResolve(anchor.anchorDay, anchor.shiftPolicy),
    queryFn: () =>
      api<AnchorResolveResponse>('/settings/anchor/resolve', {
        method: 'POST',
        body: JSON.stringify(anchor),
      }),
  });
}

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
