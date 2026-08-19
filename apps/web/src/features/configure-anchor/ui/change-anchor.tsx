import type { ShiftPolicy } from '@fin/contracts';
import { useState } from 'react';

import { ApiError } from '@/shared/api';
import { Button, Dialog, Field } from '@/shared/ui';

import {
  useChangeAnchor,
  usePreviewAnchorChange,
} from '../api/use-configure-anchor.js';

interface Props {
  anchorDay: number;
  shiftPolicy: ShiftPolicy;
}

const policies = {
  'The preceding business day': 'PRECEDING',
  'The following business day': 'FOLLOWING',
} as const;

type PolicyLabel = keyof typeof policies;

/** UC-1.1 — the anchor decides where every cycle begins. */
export function ChangeAnchor({ anchorDay, shiftPolicy }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        Change the anchor
      </Button>
      <Dialog
        open={open}
        title="Payday anchor"
        onClose={() => {
          setOpen(false);
        }}
      >
        <Form
          anchorDay={anchorDay}
          shiftPolicy={shiftPolicy}
          onDone={() => {
            setOpen(false);
          }}
        />
      </Dialog>
    </>
  );
}

function Form({
  anchorDay,
  shiftPolicy,
  onDone,
}: Props & { onDone: () => void }) {
  const [day, setDay] = useState(String(anchorDay));
  const [policy, setPolicy] = useState<ShiftPolicy>(shiftPolicy);
  const [error, setError] = useState<string>();

  const preview = usePreviewAnchorChange();
  const change = useChangeAnchor();
  const proposal = { anchorDay: Number(day), shiftPolicy: policy };
  const blocked = (preview.data?.orphanedEntries ?? 0) > 0;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-zinc-500">
        Changing the anchor re-slices every open cycle. Closed cycles are never
        re-sliced.
      </p>

      <Field
        label="Day of month"
        type="number"
        value={day}
        onChange={(event) => {
          setDay(event.target.value);
        }}
        hint="A day past the end of a short month falls on its last day"
      />

      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
        When it lands on a weekend or holiday
        <select
          value={
            policy === 'PRECEDING'
              ? 'The preceding business day'
              : 'The following business day'
          }
          onChange={(event) => {
            setPolicy(policies[event.target.value as PolicyLabel]);
          }}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-normal"
        >
          {Object.keys(policies).map((label) => (
            <option key={label}>{label}</option>
          ))}
        </select>
      </label>

      <Button
        disabled={preview.isPending}
        onClick={() => {
          setError(undefined);
          preview.mutate(proposal);
        }}
      >
        Preview
      </Button>

      {preview.data !== undefined && (
        <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 text-xs">
          {/* What the change would do lands as it appears, not silently. */}
          <span role="alert">
            {preview.data.totalEntriesMoving} entries would move out of their
            cycle.
          </span>
          <ul className="flex flex-col gap-0.5 text-zinc-500">
            {preview.data.shifts.map((shift) => (
              <li key={shift.month}>
                {shift.month}: {shift.currentRange} → {shift.proposedRange}
              </li>
            ))}
          </ul>
          {blocked && (
            <span role="alert" className="text-red-700">
              {preview.data.orphanedEntries} entries would fall outside every
              open cycle. Move or settle them first.
            </span>
          )}
        </div>
      )}

      {error !== undefined && (
        <span role="alert" className="text-xs text-red-700">
          {error}
        </span>
      )}

      <Button
        variant="primary"
        disabled={preview.data === undefined || blocked || change.isPending}
        onClick={() => {
          change.mutate(proposal, {
            onSuccess: onDone,
            onError: (failure) => {
              // A 409 here is an explanation, not a status code.
              setError(
                failure instanceof ApiError
                  ? failure.message
                  : 'The change could not be applied.',
              );
            },
          });
        }}
      >
        Apply the change
      </Button>
    </div>
  );
}
