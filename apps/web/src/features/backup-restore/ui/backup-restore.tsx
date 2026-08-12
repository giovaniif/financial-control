import type { BackupDocument } from '@fin/contracts';
import { useState } from 'react';

import { ApiError } from '@/shared/api';
import { Button, Dialog } from '@/shared/ui';

import {
  useExportBackup,
  useRestoreBackup,
} from '../api/use-backup-restore.js';

interface Counts {
  accounts: number;
  cycles: number;
  templates: number;
  cards: number;
  buckets: number;
}

/**
 * UC-1.6 — the export and the import. The user is the only operator and the
 * only backup: there is no import from a bank or a spreadsheet, and nothing
 * taking snapshots behind them.
 */
export function BackupRestore({ counts }: { counts: Counts }) {
  const [importing, setImporting] = useState(false);
  const [exported, setExported] = useState<string>();
  const download = useExportBackup();

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-zinc-500">
        A full export and re-import. There is no import from a bank or a
        spreadsheet, and nothing else taking snapshots, so this is the only way
        back from a mistake.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={download.isPending}
          onClick={() => {
            download.mutate(undefined, {
              onSuccess: (document) => {
                setExported(save(document));
              },
            });
          }}
        >
          Export
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            setImporting(true);
          }}
        >
          Import
        </Button>
      </div>

      {exported !== undefined && (
        <p className="text-xs text-green-700">Saved as {exported}.</p>
      )}

      <Dialog
        open={importing}
        title="Replace everything from a backup"
        onClose={() => {
          setImporting(false);
        }}
      >
        <ImportForm
          counts={counts}
          onDone={() => {
            setImporting(false);
          }}
        />
      </Dialog>
    </div>
  );
}

function ImportForm({
  counts,
  onDone,
}: {
  counts: Counts;
  onDone: () => void;
}) {
  const restore = useRestoreBackup();
  const [document_, setDocument] = useState<BackupDocument>();
  const [error, setError] = useState<string>();

  const read = async (file: File | undefined) => {
    setError(undefined);
    setDocument(undefined);

    if (file === undefined) {
      return;
    }

    try {
      setDocument(JSON.parse(await file.text()) as BackupDocument);
    } catch {
      setError(`${file.name} could not be read as a backup.`);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* What is about to be lost, in counts: "all your data" is not
          something anyone can check against what they have. */}
      <p
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900"
      >
        This replaces everything currently in the app: {counts.accounts}{' '}
        accounts, {counts.cycles} cycles, {counts.templates} templates,{' '}
        {counts.cards} cards and {counts.buckets} buckets. There is no undo.
      </p>

      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
        Backup file
        <input
          type="file"
          accept="application/json"
          onChange={(event) => {
            void read(event.target.files?.[0]);
          }}
          className="text-sm font-normal"
        />
      </label>

      {error !== undefined && (
        <span className="text-xs text-red-700">{error}</span>
      )}

      <Button
        variant="danger"
        disabled={document_ === undefined || restore.isPending}
        onClick={() => {
          if (document_ === undefined) {
            return;
          }

          restore.mutate(document_, {
            onSuccess: onDone,
            onError: (failure) => {
              setError(
                failure instanceof ApiError
                  ? failure.message
                  : 'The backup could not be restored.',
              );
            },
          });
        }}
      >
        Replace everything
      </Button>
    </div>
  );
}

/**
 * Named for the day it was taken, because a folder of backups is only useful
 * if they can be told apart.
 */
function save(backup: BackupDocument): string {
  const name = `financial-control-${backup.exportedAt.slice(0, 10)}.json`;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }),
  );

  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);

  return name;
}
