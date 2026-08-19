import type { SpreadsheetReading } from '@fin/contracts';

import { formatBRL } from '@/shared/lib';
import { Badge, Field } from '@/shared/ui';

import {
  blankBucket,
  type ImportDraftHandle,
} from '../../../model/use-import-draft.js';

interface Props extends ImportDraftHandle {
  reading: SpreadsheetReading;
}

/**
 * UC-6.1 — the buckets and their rules came from the sheet's own formulas.
 * What it cannot say is whether each one is a goal or an ongoing commitment.
 */
export function ImportBuckets({ reading, draft, setBucket }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-zinc-600">
        These came from the sheet, and their rules were read off its formulas.
        What it cannot say is which are{' '}
        <strong className="font-medium text-zinc-900">goals</strong> — a target
        amount by a target date — and which are{' '}
        <strong className="font-medium text-zinc-900">ongoing</strong>, with no
        finish line to be part-way to.
      </p>

      <ul className="flex flex-col gap-3">
        {reading.buckets.map((bucket) => {
          const answer = draft.buckets[bucket.name] ?? blankBucket();

          return (
            <li
              key={bucket.name}
              className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{bucket.name}</span>
                {bucket.rule !== null && (
                  <Badge tone="info">
                    {bucket.rule.kind === 'PERCENT'
                      ? `${String(bucket.rule.percent)}% per cycle`
                      : `${formatBRL(bucket.rule.amount)} per cycle`}
                  </Badge>
                )}
                {bucket.latestBalance !== null && (
                  <span className="font-mono text-xs text-zinc-500">
                    {formatBRL(bucket.latestBalance)}
                  </span>
                )}
              </div>

              <fieldset className="flex gap-4 text-sm">
                <legend className="sr-only">{bucket.name} kind</legend>
                {(['GOAL', 'ONGOING'] as const).map((mode) => (
                  <label
                    key={mode}
                    className="flex items-center gap-2 capitalize"
                  >
                    <input
                      type="radio"
                      name={`mode-${bucket.name}`}
                      checked={answer.mode === mode}
                      onChange={() => {
                        setBucket(bucket.name, { mode });
                      }}
                    />
                    {mode.toLowerCase()}
                  </label>
                ))}
              </fieldset>

              {answer.mode === 'GOAL' && (
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label={`${bucket.name} target`}
                    value={answer.target}
                    placeholder="150.000,00"
                    onChange={(event) => {
                      setBucket(bucket.name, { target: event.target.value });
                    }}
                    {...(answer.target === ''
                      ? { error: 'A goal needs a target.' }
                      : {})}
                  />
                  <Field
                    label={`${bucket.name} target date`}
                    type="date"
                    value={answer.targetDate}
                    onChange={(event) => {
                      setBucket(bucket.name, {
                        targetDate: event.target.value,
                      });
                    }}
                    {...(answer.targetDate === ''
                      ? { error: 'And the date you want it by.' }
                      : {})}
                  />
                </div>
              )}

              {bucket.balanceWasOverwritten && (
                <div className="flex flex-col gap-2 rounded-lg bg-amber-50 p-3">
                  {/* UC-6.7 — the spreadsheet typed over its own running
                      total, so the history behind this figure is gone. */}
                  <p className="text-xs text-amber-900">
                    The sheet typed this balance over its own running total, so
                    the history behind it is gone. It comes in as a correction
                    with a reason, not as money this app watched you save.
                  </p>
                  <div className="w-40">
                    <Field
                      label={`${bucket.name} opening balance`}
                      value={answer.seedBalance}
                      placeholder={
                        bucket.latestBalance === null
                          ? '0,00'
                          : formatBRL(bucket.latestBalance)
                      }
                      onChange={(event) => {
                        setBucket(bucket.name, {
                          seedBalance: event.target.value,
                        });
                      }}
                    />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
