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

interface RowProps {
  label: string;
  amounts: number[];
  /** Bills only. The salary's day is the payday anchor — see UC-1.1. */
  dueDay?: { value: string; onChange: (day: string) => void };
  /** Bills only — the salary is what every cycle boundary is measured from. */
  estimate?: { checked: boolean; onToggle: () => void };
}

function TemplateRow({ label, amounts, dueDay, estimate }: RowProps) {
  const steps = stepsOf(amounts);
  const latest = amounts[amounts.length - 1] ?? 0;

  return (
    <li className="grid grid-cols-[1fr_auto_auto] items-end gap-3 border-b border-zinc-100 pb-2">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        <span
          className={`font-mono text-xs ${latest > 0 ? 'text-green-700' : 'text-zinc-500'}`}
        >
          {steps.length > 1
            ? // One template with a value schedule, not several bills.
              steps.map((amount) => formatBRL(amount)).join(' → ')
            : formatBRL(latest)}
        </span>
      </div>

      {estimate !== undefined ? (
        <label className="flex items-center gap-2 text-xs text-zinc-600">
          <input
            type="checkbox"
            checked={estimate.checked}
            onChange={estimate.onToggle}
          />
          <Badge tone="warning">~estimate</Badge>
        </label>
      ) : (
        <span />
      )}

      {dueDay !== undefined ? (
        <div className="w-24">
          <Field
            label="Due day"
            type="number"
            min={1}
            max={31}
            value={dueDay.value}
            onChange={(event) => {
              dueDay.onChange(event.target.value);
            }}
          />
        </div>
      ) : (
        <span className="w-24" />
      )}
    </li>
  );
}

/**
 * UC-2 — what repeats every cycle, pre-filled, each needing the one thing the
 * sheet has none of: a due day. That is the single biggest source of wrongness
 * in an import, because a bad one survives in the totals but ruins the running
 * balance.
 *
 * Income and outgoings are kept apart deliberately. The salary is the wage
 * received, and listing it among the bills read as the app having misfiled the
 * largest figure in the sheet.
 */
export function ImportTemplates({
  reading,
  draft,
  setDueDay,
  toggleEstimate,
}: Props) {
  const cards = new Set(draft.cardLabels);
  const salary = seriesOf(reading, SALARY);
  const bills = reading.outcomeLabels.filter((label) => !cards.has(label));

  return (
    <div className="flex flex-col gap-6">
      {salary.length > 0 && (
        <section
          aria-labelledby="import-income"
          className="flex flex-col gap-3"
        >
          <h2 id="import-income" className="text-sm font-medium text-zinc-900">
            Money coming in
          </h2>
          <p className="text-sm text-zinc-600">
            Nothing to fill in — the day it arrives is the payday anchor you set
            earlier, which is the same date every cycle is measured from.
          </p>
          <ul className="flex flex-col gap-2">
            <TemplateRow label={SALARY} amounts={salary} />
          </ul>
        </section>
      )}

      <section aria-labelledby="import-bills" className="flex flex-col gap-3">
        <h2 id="import-bills" className="text-sm font-medium text-zinc-900">
          The bills that repeat
        </h2>
        <p className="text-sm text-zinc-600">
          These came from the sheet. Each needs a due day — the day of the month
          the money actually leaves, which is what lets the ledger carry a
          running balance rather than one monthly total.
        </p>
        <ul className="flex flex-col gap-2">
          {bills.map((label) => (
            <TemplateRow
              key={label}
              label={label}
              amounts={seriesOf(reading, label)}
              dueDay={{
                value: draft.dueDays[label] ?? '',
                onChange: (day) => {
                  setDueDay(label, day);
                },
              }}
              estimate={{
                checked: draft.estimates.includes(label),
                onToggle: () => {
                  toggleEstimate(label);
                },
              }}
            />
          ))}
        </ul>
      </section>

      <p className="text-xs text-zinc-500">
        An amount shown as a chain changed across the months. It comes in as one
        template with a value schedule, not as several bills.
      </p>
    </div>
  );
}
