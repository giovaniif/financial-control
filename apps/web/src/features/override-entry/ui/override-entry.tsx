import { useState } from 'react';

import { formatBRL, parseBRL } from '@/shared/lib';
import { Button, Dialog, Field } from '@/shared/ui';

import { useOverrideEntry } from '../api/use-override-entry.js';

interface Props {
  month: string;
  entryId: string;
  planned: number;
  isOverridden: boolean;
}

/** UC-3.7 — change one cycle's figure, and put it back in one action. */
export function OverrideEntry({
  month,
  entryId,
  planned,
  isOverridden,
}: Props) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(digitsOf(Math.abs(planned)));
  const [error, setError] = useState<string>();
  const { override, revert } = useOverrideEntry(month, entryId);
  const isIncoming = planned > 0;

  const submit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    const cents = parseBRL(amount);

    if (cents === null) {
      setError('Enter an amount like 1.234,56.');
      return;
    }

    const magnitude = Math.abs(cents);

    override.mutate(isIncoming ? magnitude : -magnitude, {
      onSuccess: () => {
        setOpen(false);
      },
    });
  };

  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        Override
      </Button>
      {isOverridden && (
        <Button
          disabled={revert.isPending}
          onClick={() => {
            revert.mutate();
          }}
        >
          Revert
        </Button>
      )}

      <Dialog
        open={open}
        title="Override this cycle"
        onClose={() => {
          setOpen(false);
        }}
      >
        <form onSubmit={submit} className="flex flex-col gap-3">
          <p className="text-xs text-zinc-500">
            Changes only this cycle. The template behind it is untouched, so
            every other cycle keeps its projected value.
          </p>
          <Field
            label="Amount for this cycle"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
            }}
            hint={`Projected ${formatBRL(planned)}`}
            {...(error === undefined ? {} : { error })}
          />
          <Button variant="primary" type="submit" disabled={override.isPending}>
            Save override
          </Button>
        </form>
      </Dialog>
    </>
  );
}

function digitsOf(cents: number): string {
  return formatBRL(cents).replace(/[^\d,-]/g, '');
}
