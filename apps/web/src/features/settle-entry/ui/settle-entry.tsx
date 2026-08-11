import { useState } from 'react';

import { formatBRL, parseBRL } from '@/shared/lib';
import { Button, Dialog, Field } from '@/shared/ui';

import { useSettleEntry } from '../api/use-settle-entry.js';

interface Props {
  month: string;
  entryId: string;
  /** Money in is received; money out is paid. */
  planned: number;
}

/**
 * UC-3.5 — one click when the actual equals the planned amount, two when it
 * does not. The one-click path stays a single button: this is the most
 * repeated action in the app, and burying it behind a form would be felt
 * every day.
 */
export function SettleEntry({ month, entryId, planned }: Props) {
  const [open, setOpen] = useState(false);
  const settle = useSettleEntry();
  const isIncoming = planned > 0;
  const status = isIncoming ? 'RECEIVED' : 'PAID';

  return (
    <span className="flex items-center justify-end gap-1">
      <Button
        disabled={settle.isPending}
        onClick={() => {
          settle.mutate({ month, entryId, status });
        }}
      >
        {isIncoming ? 'Confirm' : 'Settle'}
      </Button>
      <Button
        aria-label="Settle at a different amount"
        disabled={settle.isPending}
        onClick={() => {
          setOpen(true);
        }}
      >
        …
      </Button>

      <Dialog
        open={open}
        title={isIncoming ? 'Confirm what arrived' : 'Settle at what was paid'}
        onClose={() => {
          setOpen(false);
        }}
      >
        <ActualForm
          planned={planned}
          isPending={settle.isPending}
          onSave={(magnitude) => {
            settle.mutate(
              {
                month,
                entryId,
                status,
                actual: isIncoming ? magnitude : -magnitude,
              },
              {
                onSuccess: () => {
                  setOpen(false);
                },
              },
            );
          }}
          onSkip={() => {
            settle.mutate(
              { month, entryId, status: 'SKIPPED' },
              {
                onSuccess: () => {
                  setOpen(false);
                },
              },
            );
          }}
        />
      </Dialog>
    </span>
  );
}

/** `R$ 320,00` typed back as `320,00`, ready to be edited. */
function digitsOf(cents: number): string {
  return formatBRL(cents).replace(/[^\d,-]/g, '');
}

function ActualForm({
  planned,
  isPending,
  onSave,
  onSkip,
}: {
  planned: number;
  isPending: boolean;
  onSave: (magnitude: number) => void;
  onSkip: () => void;
}) {
  // Prefilled with the plan, because the actual usually matches it.
  const [actual, setActual] = useState(digitsOf(Math.abs(planned)));
  const [error, setError] = useState<string>();

  const submit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    const cents = parseBRL(actual);

    if (cents === null) {
      setError('Enter an amount like 1.234,56.');
      return;
    }
    onSave(Math.abs(cents));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field
        label="Actual amount"
        value={actual}
        onChange={(event) => {
          setActual(event.target.value);
        }}
        hint={`Planned ${formatBRL(planned)}`}
        {...(error === undefined ? {} : { error })}
      />
      <div className="flex items-center justify-between gap-2">
        {/* A plan that never happened, not one paid at zero. */}
        <Button type="button" disabled={isPending} onClick={onSkip}>
          Skip it
        </Button>
        <Button variant="primary" type="submit" disabled={isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}
