import { useState } from 'react';

import { parseBRL } from '@/shared/lib';
import { Button, Dialog, Field } from '@/shared/ui';

import { useRecordBucketEvent } from '../api/use-manage-buckets.js';

interface Props {
  bucketId: string;
  bucketName: string;
  month: string;
}

const kinds = {
  'Override this cycle': 'OVERRIDE',
  Yield: 'YIELD',
  Correction: 'CORRECTION',
  Withdrawal: 'WITHDRAWAL',
} as const;

type Label = keyof typeof kinds;

/**
 * UC-6.5 and UC-6.7 — every way a bucket's balance moves other than the rule
 * applying. The log is append-only and the balance is the fold over it, so a
 * correction sits alongside the contributions it supersedes rather than
 * overwriting them.
 */
export function RecordEvent({ bucketId, bucketName, month }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        aria-label={`Record on ${bucketName}`}
        onClick={() => {
          setOpen(true);
        }}
      >
        Record
      </Button>
      <Dialog
        open={open}
        title={`${bucketName} — record an event`}
        onClose={() => {
          setOpen(false);
        }}
      >
        <Form
          bucketId={bucketId}
          month={month}
          onDone={() => {
            setOpen(false);
          }}
        />
      </Dialog>
    </>
  );
}

function Form({
  bucketId,
  month,
  onDone,
}: {
  bucketId: string;
  month: string;
  onDone: () => void;
}) {
  const record = useRecordBucketEvent(bucketId);
  const [label, setLabel] = useState<Label>('Override this cycle');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();

  const kind = kinds[label];
  // Only the two that rewrite history against the user's own judgement.
  const needsReason = kind === 'CORRECTION' || kind === 'WITHDRAWAL';

  const submit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    const cents = parseBRL(amount);

    if (cents === null) {
      setError('Enter an amount like 1.234,56.');
      return;
    }
    if (needsReason && reason.trim() === '') {
      setError(
        kind === 'CORRECTION'
          ? 'Say why the balance is being corrected.'
          : 'Say why the money is coming out.',
      );
      return;
    }

    record.mutate(
      {
        kind,
        amount: Math.abs(cents),
        ...(kind === 'OVERRIDE' ? { month } : { date }),
        ...(needsReason ? { reason: reason.trim() } : {}),
      },
      { onSuccess: onDone },
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
        What happened
        <select
          value={label}
          onChange={(event) => {
            setLabel(event.target.value as Label);
          }}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-normal"
        >
          {Object.keys(kinds).map((each) => (
            <option key={each}>{each}</option>
          ))}
        </select>
      </label>

      <Field
        label="Amount"
        value={amount}
        placeholder="1.234,56"
        onChange={(event) => {
          setAmount(event.target.value);
        }}
        {...(kind === 'OVERRIDE'
          ? { hint: `Instead of the rule, for ${month} only` }
          : {})}
        {...(kind === 'CORRECTION'
          ? { hint: 'The balance as observed, not the difference' }
          : {})}
        {...(error !== undefined && !needsReason ? { error } : {})}
      />

      {kind !== 'OVERRIDE' && (
        <Field
          label="Date"
          type="date"
          value={date}
          onChange={(event) => {
            setDate(event.target.value);
          }}
        />
      )}

      {needsReason && (
        <Field
          label="Reason"
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
          hint="Required — a balance that moves without a trace is what this replaces"
          {...(error === undefined ? {} : { error })}
        />
      )}

      <Button variant="primary" type="submit" disabled={record.isPending}>
        Record
      </Button>
    </form>
  );
}
