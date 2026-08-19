import type { AnchorChangeRequest, ShiftPolicy } from '@fin/contracts';
import { useState } from 'react';

import { useResolveAnchor } from '@/features/configure-anchor';
import { formatRange } from '@/shared/lib';
import { Field, Skeleton } from '@/shared/ui';

interface Props {
  anchor: AnchorChangeRequest;
  onChange: (anchor: AnchorChangeRequest) => void;
}

const policies: { value: ShiftPolicy; label: string }[] = [
  { value: 'PRECEDING', label: 'the preceding business day' },
  { value: 'FOLLOWING', label: 'the following business day' },
];

/** How many resolved cycles are enough to make the pattern obvious. */
const SHOWN = 3;

/**
 * UC-1.1 — the app's one genuinely counter-intuitive idea, taught by showing
 * the real boundaries the chosen anchor produces rather than describing them.
 */
export function CycleStep({ anchor, onChange }: Props) {
  const { data, isPending } = useResolveAnchor(anchor);
  const cycles = data?.cycles.slice(0, SHOWN) ?? [];
  /**
   * The field is edited as text so it can pass through empty and half-typed
   * states. Only a real day of the month is promoted to the anchor, which is
   * what keeps the resolved preview from flickering through nonsense.
   */
  const [typed, setTyped] = useState(String(anchor.anchorDay));

  const changeDay = (value: string) => {
    setTyped(value);
    const day = Number(value);
    if (Number.isInteger(day) && day >= 1 && day <= 31) {
      onChange({ ...anchor, anchorDay: day });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 text-zinc-600">
        <p>
          This app does not think in calendar months. It thinks in{' '}
          <strong className="font-medium text-zinc-900">payday cycles</strong>:
          one salary date to the day before the next. That is how the money is
          actually experienced — an amount arrives, and it has to cover
          everything until the next amount arrives.
        </p>
        <p>
          A cycle is named for the month it is{' '}
          <strong className="font-medium text-zinc-900">spent</strong> in, so it
          opens on the <em>previous</em> month&rsquo;s payday.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="w-32">
          <Field
            label="Salary lands on day"
            type="number"
            min={1}
            max={31}
            value={typed}
            onChange={(event) => {
              changeDay(event.target.value);
            }}
          />
        </div>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-xs font-medium text-zinc-500">
            When that falls on a weekend or holiday, pay moves to
          </legend>
          {policies.map((policy) => (
            <label
              key={policy.value}
              className="flex items-center gap-2 text-sm"
            >
              <input
                type="radio"
                name="shiftPolicy"
                value={policy.value}
                checked={anchor.shiftPolicy === policy.value}
                onChange={() => {
                  onChange({ ...anchor, shiftPolicy: policy.value });
                }}
              />
              {policy.label}
            </label>
          ))}
        </fieldset>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
          Which gives you these cycles
        </p>
        {isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {cycles.map((cycle) => (
              <li key={cycle.month} className="flex items-center gap-3">
                <span className="w-36 font-medium">{cycle.label}</span>
                <span className="font-mono text-xs text-zinc-600">
                  {formatRange(cycle.start, cycle.end)}
                </span>
                {cycle.shifted && (
                  <span className="text-xs text-amber-700">
                    payday moved off a closed day
                  </span>
                )}
                {cycle.clamped && (
                  <span className="text-xs text-amber-700">
                    clamped to the month&rsquo;s last day
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {/* Day 30 would miss the 31st of the long months, so the last-day
            payday is expressed as 31 and clamped per month. */}
        <p className="text-xs text-zinc-500">
          Paid on the last day of the month? Use 31 — it clamps to each
          month&rsquo;s length, so February resolves correctly too.
        </p>
      </div>
    </div>
  );
}
