import type { BackupDocument } from '@fin/contracts';
import { useId, useState } from 'react';
import { Link } from 'react-router';

import { useRestoreBackup } from '@/features/backup-restore';
import { ApiError } from '@/shared/api';
import { Button } from '@/shared/ui';

/**
 * UC-1.6 — a backup is already a complete dataset, so it needs none of the
 * conversation and skips every question it would have asked.
 */
export function RestoreBackup() {
  const id = useId();
  const restore = useRestoreBackup();
  const [problem, setProblem] = useState<string>();
  const [document, setDocument] = useState<BackupDocument>();
  const [restored, setRestored] = useState(false);

  const choose = async (file: File | undefined) => {
    if (file === undefined) {
      return;
    }
    setProblem(undefined);
    try {
      setDocument(JSON.parse(await file.text()) as BackupDocument);
    } catch {
      setDocument(undefined);
      setProblem('That file is not a backup this app wrote.');
    }
  };

  if (restored) {
    return (
      <section className="flex flex-col gap-3 border-t border-zinc-200 pt-6">
        <p className="text-sm text-zinc-700">
          Your backup is restored — the app is ready, and nothing else needs
          setting up.
        </p>
        <div>
          <Link
            to="/"
            className="inline-block rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-800"
          >
            Open Main
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2 border-t border-zinc-200 pt-6">
      <h2 className="text-sm font-semibold">Already have a backup?</h2>
      <p className="text-sm text-zinc-600">
        A file this app exported is a complete dataset, so it goes straight in
        and none of the questions above are needed.
      </p>
      <label htmlFor={id} className="text-xs font-medium text-zinc-600">
        Your backup file
      </label>
      <input
        id={id}
        type="file"
        accept="application/json,.json"
        onChange={(event) => {
          void choose(event.target.files?.[0]);
        }}
        className="text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-zinc-200 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium"
      />
      {/* Restoring replaces everything, which on a first run is nothing. */}
      <p className="text-xs text-zinc-500">
        Restoring replaces the whole dataset.
      </p>
      <div>
        <Button
          disabled={document === undefined || restore.isPending}
          onClick={() => {
            if (document === undefined) {
              return;
            }
            restore.mutate(document, {
              onSuccess: () => {
                setRestored(true);
              },
              onError: (error) => {
                setProblem(
                  error instanceof ApiError
                    ? error.message
                    : 'That backup could not be restored.',
                );
              },
            });
          }}
        >
          Restore this backup
        </Button>
      </div>
      {problem !== undefined && (
        <p role="alert" className="text-sm text-red-700">
          {problem}
        </p>
      )}
    </section>
  );
}
