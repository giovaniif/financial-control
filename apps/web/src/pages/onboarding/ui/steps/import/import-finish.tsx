import type {
  AnchorChangeRequest,
  ImportReportResponse,
  SpreadsheetReading,
} from '@fin/contracts';
import { useState } from 'react';
import { Link } from 'react-router';

import { useApplyImport } from '@/features/import-spreadsheet';
import { ApiError } from '@/shared/api';
import { formatBRL } from '@/shared/lib';
import { Button } from '@/shared/ui';

import {
  toImportAnswers,
  type ImportDraft,
} from '../../../model/use-import-draft.js';

interface Props {
  reading: SpreadsheetReading;
  draft: ImportDraft;
  anchor: AnchorChangeRequest;
}

const FIGURES = {
  totalOutcome: 'Total Gasto',
  surplus: 'Sobra',
  expectedSurplus: 'Sobra Esperada',
} as const;

/**
 * UC-1.7 — the import runs here, and its reconciliation is the acceptance test
 * for the whole thing: a figure that quietly differs from the spreadsheet is
 * worse than one that is missing.
 */
export function ImportFinish({ reading, draft, anchor }: Props) {
  const apply = useApplyImport();
  const [report, setReport] = useState<ImportReportResponse>();
  const [problem, setProblem] = useState<string>();

  if (report !== undefined) {
    return <Report report={report} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-zinc-600">
        Everything is ready. Loading replaces whatever the app currently holds,
        and then checks its own figures against the spreadsheet&rsquo;s.
      </p>

      <div>
        <Button
          variant="primary"
          disabled={apply.isPending}
          onClick={() => {
            setProblem(undefined);
            apply.mutate(
              {
                reading,
                answers: toImportAnswers(draft, anchor, reading),
              },
              {
                onSuccess: setReport,
                onError: (error) => {
                  setProblem(
                    error instanceof ApiError
                      ? error.message
                      : 'The import could not be completed.',
                  );
                },
              },
            );
          }}
        >
          {apply.isPending ? 'Loading…' : 'Load my spreadsheet'}
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

function Report({ report }: { report: ImportReportResponse }) {
  const { imported, mismatches, notes } = report;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-zinc-600">
        Loaded {imported.templates} templates, {imported.accounts} accounts,{' '}
        {imported.cards} cards and {imported.buckets} buckets across{' '}
        {imported.months} cycles.
      </p>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
          Against the spreadsheet&rsquo;s own figures
        </p>
        {mismatches.length === 0 ? (
          <p className="text-sm text-green-700">
            Every cycle reconciles exactly.
          </p>
        ) : (
          <table className="text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="pr-4 font-medium">Cycle</th>
                <th className="pr-4 font-medium">Figure</th>
                <th className="pr-4 font-medium">Sheet</th>
                <th className="font-medium">Imported</th>
              </tr>
            </thead>
            <tbody>
              {mismatches.map((row) => (
                <tr key={`${row.month}-${row.figure}`}>
                  <td className="pr-4">{row.month}</td>
                  <td className="pr-4">{FIGURES[row.figure]}</td>
                  <td className="pr-4 font-mono text-xs">
                    {formatBRL(row.sheet)}
                  </td>
                  <td className="font-mono text-xs">
                    {formatBRL(row.imported)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {notes.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
            What is not quite right
          </p>
          <ul className="list-disc pl-5 text-sm text-zinc-600">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <Link
          to="/"
          className="inline-block rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-800"
        >
          Open the Dashboard
        </Link>
      </div>
    </div>
  );
}
