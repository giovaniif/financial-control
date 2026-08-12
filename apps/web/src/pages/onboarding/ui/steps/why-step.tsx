import type { BackupDocument, SpreadsheetReading } from '@fin/contracts';
import { useId, useState } from 'react';

import { useRestoreBackup } from '@/features/backup-restore';
import {
  ReadingReview,
  UploadSpreadsheet,
} from '@/features/import-spreadsheet';
import { ApiError } from '@/shared/api';
import { Button } from '@/shared/ui';

export type StartMode = 'scratch' | 'spreadsheet' | 'backup';

interface Props {
  mode: StartMode | undefined;
  onChooseMode: (mode: StartMode) => void;
  reading: SpreadsheetReading | undefined;
  onRead: (reading: SpreadsheetReading, file: File) => void;
  onCorrectYear: (firstColumnYear: number) => void;
  isRereading: boolean;
  onRestored: () => void;
}

const questions = [
  {
    id: 'q1',
    question:
      "It's the middle of the month. How much will I pay in the next cycle, and how much will be left when I'm next paid?",
    answer:
      'The Dashboard answers this in one sentence — with the actual dates money leaves the account, not an average monthly spend.',
  },
  {
    id: 'q2',
    question: 'What does my future look like?',
    answer:
      'The Wealth Projection answers this — where your current saving rate lands in 5, 10, 20 and 30 years, and whether each goal will be met on time.',
  },
];

const choices: { mode: StartMode; label: string; body: string }[] = [
  {
    mode: 'spreadsheet',
    label: 'From my spreadsheet',
    body: 'Reads a “Controle Financeiro” workbook. It fills in the bills, the amounts and the bucket rules; the next steps ask for the dates it has none of.',
  },
  {
    mode: 'backup',
    label: 'From a backup',
    body: 'A file this app exported. It is a complete dataset, so it goes straight in and the rest of setup is skipped.',
  },
  {
    mode: 'scratch',
    label: 'From scratch',
    body: 'Six short steps. Each explains one idea and then asks you for the part only you know.',
  },
];

/** UC-1.5 — the two questions everything else on the screen is evidence for. */
export function WhyStep({
  mode,
  onChooseMode,
  reading,
  onRead,
  onCorrectYear,
  isRereading,
  onRestored,
}: Props) {
  const group = useId();

  return (
    <div className="flex flex-col gap-6">
      <p className="text-zinc-600">
        This app replaces a spreadsheet, and it exists to answer two questions.
        Everything in it is subordinate to one or the other.
      </p>

      <ol className="flex flex-col gap-4">
        {questions.map((item, index) => (
          <li
            key={item.id}
            className="rounded-xl border border-zinc-200 bg-white p-4"
          >
            <p className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
              Question {index + 1}
            </p>
            <p className="mt-2 font-medium text-zinc-900">
              &ldquo;{item.question}&rdquo;
            </p>
            <p className="mt-2 text-sm text-zinc-600">{item.answer}</p>
          </li>
        ))}
      </ol>

      <fieldset className="flex flex-col gap-2">
        {/* A legend is not a flex item, so the fieldset's gap skips it. */}
        <legend className="mb-2 text-xs font-semibold tracking-wider text-zinc-500 uppercase">
          How would you like to start?
        </legend>
        {choices.map((choice) => (
          <label
            key={choice.mode}
            htmlFor={`${group}-${choice.mode}`}
            className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-0.5 rounded-xl border border-zinc-200 p-3 text-sm has-checked:border-zinc-900"
          >
            <input
              id={`${group}-${choice.mode}`}
              type="radio"
              name="startMode"
              className="row-span-2 mt-1"
              checked={mode === choice.mode}
              onChange={() => {
                onChooseMode(choice.mode);
              }}
            />
            <span className="font-medium">{choice.label}</span>
            <span className="text-zinc-600">{choice.body}</span>
          </label>
        ))}
      </fieldset>

      {mode === 'spreadsheet' &&
        (reading === undefined ? (
          <UploadSpreadsheet onRead={onRead} />
        ) : (
          <ReadingReview
            reading={reading}
            onCorrectYear={onCorrectYear}
            isRereading={isRereading}
          />
        ))}

      {mode === 'backup' && <RestoreBackup onRestored={onRestored} />}
    </div>
  );
}

/** UC-1.6 — a backup is already a complete dataset, so it skips the rest. */
function RestoreBackup({ onRestored }: { onRestored: () => void }) {
  const id = useId();
  const restore = useRestoreBackup();
  const [problem, setProblem] = useState<string>();
  const [document, setDocument] = useState<BackupDocument>();

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

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
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
          variant="primary"
          disabled={document === undefined || restore.isPending}
          onClick={() => {
            if (document === undefined) {
              return;
            }
            restore.mutate(document, {
              onSuccess: onRestored,
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
    </div>
  );
}
