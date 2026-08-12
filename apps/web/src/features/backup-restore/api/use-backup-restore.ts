import type { BackupDocument } from '@fin/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/shared/api';

/** UC-1.6 — the only way data leaves the app. */
export function useExportBackup() {
  return useMutation({
    mutationFn: () => api<BackupDocument>('/backup'),
  });
}

/** UC-1.6 — and the only way it comes back. */
export function useRestoreBackup() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (document: BackupDocument) =>
      api<null>('/restore', {
        method: 'POST',
        body: JSON.stringify(document),
      }),
    onSuccess: async () => {
      // Everything on screen came from data that no longer exists.
      await client.invalidateQueries();
    },
  });
}
