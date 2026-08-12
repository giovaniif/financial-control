import type { SpreadsheetReading } from '@fin/contracts';
import { useState } from 'react';

import { Badge, Button, Field } from '@/shared/ui';

interface Props {
  reading: SpreadsheetReading;
  /** Re-reads the same file against a corrected first year. */
  onCorrectYear: (firstColumnYear: number) => void;
  isRereading: boolean;
}

/**
 * UC-1.7 — what the sheet turned out to hold, before anything is written.
 *
 * The year mapping is the one thing that has to be caught here: the sheet
 * names months but never years, so the app inferred them, and a wrong year
 * silently files everything a cycle out.
 */
export function ReadingReview({ reading, onCorrectYear, isRereading }: Props) {
  const [year, setYear] = useState(String(reading.inference.firstColumnYear));
  const filled = reading.months.filter((month) => !month.isBlank);
  const first = filled[0];
  const last = filled[filled.length - 1];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
          What was read
        </p>
        <ul className="flex flex-wrap gap-2 text-sm">
          <li>
            <Badge tone="info">{filled.length} months</Badge>
          </li>
          <li>
            <Badge tone="info">{reading.outcomeLabels.length} bills</Badge>
          </li>
          <li>
            <Badge tone="info">{reading.buckets.length} buckets</Badge>
          </li>
        </ul>
        {first !== undefined && last !== undefined && (
          <p className="text-sm text-zinc-600">
            {first.monthName} through {last.monthName} — the {first.month} to{' '}
            {last.month} cycles.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-medium text-amber-900">
          Check the years before going on
        </p>
        <p className="text-sm text-amber-900">{reading.inference.reasoning}</p>
        <div className="flex items-end gap-3">
          <div className="w-40">
            <Field
              label="First column is"
              type="number"
              value={year}
              onChange={(event) => {
                setYear(event.target.value);
              }}
            />
          </div>
          <Button
            onClick={() => {
              onCorrectYear(Number(year));
            }}
            disabled={
              isRereading ||
              Number(year) === reading.inference.firstColumnYear ||
              !Number.isSafeInteger(Number(year))
            }
          >
            Re-read with this year
          </Button>
        </div>
      </div>

      {reading.warnings.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
            Worth a look
          </p>
          <ul className="list-disc pl-5 text-sm text-zinc-600">
            {reading.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
          What the sheet cannot tell us
        </p>
        <ul className="list-disc pl-5 text-sm text-zinc-600">
          {reading.missing.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="mt-1 text-sm text-zinc-600">
          The next steps ask for each of these, with your own figures already
          filled in.
        </p>
      </div>
    </div>
  );
}
