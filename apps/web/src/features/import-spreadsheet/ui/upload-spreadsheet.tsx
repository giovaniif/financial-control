import type { SpreadsheetReading } from '@fin/contracts';
import { useId, useState } from 'react';

import { ApiError } from '@/shared/api';

import { useReadSpreadsheet } from '../api/use-import-spreadsheet.js';

interface Props {
  onRead: (reading: SpreadsheetReading, file: File) => void;
}

/** UC-1.7 — hands the workbook over and shows what came back. */
export function UploadSpreadsheet({ onRead }: Props) {
  const id = useId();
  const read = useReadSpreadsheet();
  const [problem, setProblem] = useState<string>();

  const choose = (file: File | undefined) => {
    if (file === undefined) {
      return;
    }
    setProblem(undefined);
    read.mutate(
      { file },
      {
        onSuccess: (reading) => {
          onRead(reading, file);
        },
        onError: (error) => {
          setProblem(
            error instanceof ApiError
              ? error.message
              : 'That file could not be read. Export it as .xlsx and try again.',
          );
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        Your spreadsheet
      </label>
      <input
        id={id}
        type="file"
        accept=".xlsx"
        disabled={read.isPending}
        onChange={(event) => {
          choose(event.target.files?.[0]);
        }}
        className="text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-zinc-200 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium"
      />
      <p className="text-xs text-zinc-500">
        Nothing is saved yet — you will see what was read before anything is
        written.
      </p>
      {read.isPending && (
        <p role="status" className="text-sm text-zinc-600">
          Reading the spreadsheet…
        </p>
      )}
      {problem !== undefined && (
        <p role="alert" className="text-sm text-red-700">
          {problem}
        </p>
      )}
    </div>
  );
}
