import { useState } from 'react';

import { formatRange, parseBRL } from '@/shared/lib';
import { Button, Dialog, Field } from '@/shared/ui';

import { useAddEntry } from '../api/use-add-entry.js';

interface Props {
  month: string;
  start: string;
  end: string;
}

type Direction = 'Money out' | 'Money in';

/** UC-3.4 — a shared dinner paid back, a side project, an unusual bill. */
export function AddEntryButton({ month, start, end }: Props) {
  const [open, setOpen] = useState(false);
  const add = useAddEntry(month);

  return (
    <>
      <Button
        variant="primary"
        onClick={() => {
          setOpen(true);
        }}
      >
        Add an entry
      </Button>
      <Dialog
        open={open}
        title="Add an entry"
        onClose={() => {
          setOpen(false);
        }}
      >
        <Form
          start={start}
          end={end}
          isPending={add.isPending}
          onSubmit={(entry) => {
            add.mutate(entry, {
              onSuccess: () => {
                setOpen(false);
              },
            });
          }}
        />
      </Dialog>
    </>
  );
}

interface Entry {
  description: string;
  kind: 'VARIABLE';
  dueDate: string;
  amount: number;
  isEstimate: boolean;
}

function Form({
  start,
  end,
  isPending,
  onSubmit,
}: {
  start: string;
  end: string;
  isPending: boolean;
  onSubmit: (entry: Entry) => void;
}) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<Direction>('Money out');
  const [dueDate, setDueDate] = useState(start);
  const [isEstimate, setIsEstimate] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (event: { preventDefault: () => void }) => {
    event.preventDefault();

    const cents = parseBRL(amount);
    const found: Record<string, string> = {};

    if (description.trim() === '') {
      found['description'] = 'Say what the entry is for.';
    }
    if (cents === null) {
      found['amount'] = 'Enter an amount like 1.234,56.';
    }
    // The due date is what assigns an entry to a cycle, so one outside it
    // would land somewhere else entirely — see UC-3.2.
    if (dueDate < start || dueDate > end) {
      found['dueDate'] =
        `The date must fall inside ${formatRange(start, end)}.`;
    }

    setErrors(found);
    if (Object.keys(found).length > 0 || cents === null) {
      return;
    }

    const magnitude = Math.abs(cents);

    onSubmit({
      description: description.trim(),
      kind: 'VARIABLE',
      dueDate,
      amount: direction === 'Money in' ? magnitude : -magnitude,
      isEstimate,
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field
        label="Description"
        value={description}
        onChange={(event) => {
          setDescription(event.target.value);
        }}
        {...(errors['description'] === undefined
          ? {}
          : { error: errors['description'] })}
      />

      <div className="flex flex-col gap-1">
        <label
          htmlFor="add-entry-direction"
          className="text-xs font-medium text-zinc-600"
        >
          Direction
        </label>
        <select
          id="add-entry-direction"
          value={direction}
          onChange={(event) => {
            setDirection(event.target.value as Direction);
          }}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm"
        >
          <option>Money out</option>
          <option>Money in</option>
        </select>
      </div>

      <Field
        label="Amount"
        value={amount}
        placeholder="1.234,56"
        onChange={(event) => {
          setAmount(event.target.value);
        }}
        {...(errors['amount'] === undefined ? {} : { error: errors['amount'] })}
      />

      <Field
        label="Due date"
        type="date"
        value={dueDate}
        onChange={(event) => {
          setDueDate(event.target.value);
        }}
        hint={`Inside ${formatRange(start, end)}`}
        {...(errors['dueDate'] === undefined
          ? {}
          : { error: errors['dueDate'] })}
      />

      <label className="flex items-center gap-2 text-xs text-zinc-600">
        <input
          type="checkbox"
          checked={isEstimate}
          onChange={(event) => {
            setIsEstimate(event.target.checked);
          }}
        />
        Unconfirmed estimate
      </label>

      <Button variant="primary" type="submit" disabled={isPending}>
        Add
      </Button>
    </form>
  );
}
