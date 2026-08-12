import type { SpreadsheetReading } from '@fin/contracts';

import { formatBRL } from '@/shared/lib';
import { Badge, Field } from '@/shared/ui';

import type { ImportDraftHandle } from '../../../model/use-import-draft.js';

interface Props extends ImportDraftHandle {
  reading: SpreadsheetReading;
}

const SALARY = 'Salário';

/** Every amount a label took, in month order, ignoring the blank columns. */
function seriesOf(reading: SpreadsheetReading, label: string): number[] {
  return reading.months
    .filter((month) => !month.isBlank)
    .flatMap((month) =>
      label === SALARY
        ? month.salary === null
          ? []
          : [month.salary]
        : month.outcomes
            .filter((outcome) => outcome.label === label)
            .map((outcome) => outcome.amount),
    );
}

/** The distinct steps a series took — UC-2.4's value schedule. */
function stepsOf(amounts: number[]): number[] {
  return amounts.filter((amount, index) => amount !== amounts[index - 1]);
}

/**
 * UC-2 — the bills, pre-filled, each needing the one thing the sheet has none
 * of: a due day. That is the single biggest source of wrongness in an import,
 * because a bad one survives in the totals but ruins the running balance.
 */
export function ImportTemplates({
  reading,
  draft,
  setDueDay,
  toggleEstimate,
}: Props) {
  const cards = new Set(draft.cardLabels);
  const labels = [
    ...(seriesOf(reading, SALARY).length > 0 ? [SALARY] : []),
    ...reading.outcomeLabels.filter((label) => !cards.has(label)),
  ];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-zinc-600">
        These came from the sheet. Each needs a{' '}
        <strong className="font-medium text-zinc-900">due day</strong> — the day
        of the month the money actually leaves, which is what lets the ledger
        carry a running balance rather than one monthly total.
      </p>

      <ul className="flex flex-col gap-2">
        {labels.map((label) => {
          const amounts = seriesOf(reading, label);
          const steps = stepsOf(amounts);
          const latest = amounts[amounts.length - 1] ?? 0;

          return (
            <li
              key={label}
              className="grid grid-cols-[1fr_auto_auto] items-end gap-3 border-b border-zinc-100 pb-2"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{label}</span>
                {steps.length > 1 ? (
                  // One template with a value schedule, not several bills.
                  <span className="font-mono text-xs text-zinc-500">
                    {steps.map((amount) => formatBRL(amount)).join(' → ')}
                  </span>
                ) : (
                  <span className="font-mono text-xs text-zinc-500">
                    {formatBRL(latest)}
                  </span>
                )}
              </div>

              <label className="flex items-center gap-2 text-xs text-zinc-600">
                <input
                  type="checkbox"
                  checked={draft.estimates.includes(label)}
                  onChange={() => {
                    toggleEstimate(label);
                  }}
                />
                <Badge tone="warning">~estimate</Badge>
              </label>

              <div className="w-24">
                <Field
                  label="Due day"
                  type="number"
                  min={1}
                  max={31}
                  value={draft.dueDays[label] ?? ''}
                  onChange={(event) => {
                    setDueDay(label, event.target.value);
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-zinc-500">
        An amount shown as a chain changed across the months. It comes in as one
        template with a value schedule, not as several bills.
      </p>
    </div>
  );
}
