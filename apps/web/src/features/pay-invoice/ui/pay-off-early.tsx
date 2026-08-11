import { useState } from 'react';

import { parseBRL } from '@/shared/lib';
import { Button, Dialog, Field } from '@/shared/ui';

import { usePayOffEarly } from '../api/use-pay-invoice.js';

interface Props {
  cardId: string;
  purchaseId: string;
  description: string;
}

/** UC-5.6 — anticipate what is left of an instalment plan. */
export function PayOffEarly({ cardId, purchaseId, description }: Props) {
  const [open, setOpen] = useState(false);
  const [discount, setDiscount] = useState('');
  const [error, setError] = useState<string>();
  const payOff = usePayOffEarly(cardId);

  const submit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    const cents = discount.trim() === '' ? 0 : parseBRL(discount);

    if (cents === null) {
      setError('Enter an amount like 1.234,56.');
      return;
    }

    payOff.mutate(
      { purchaseId, discount: Math.abs(cents) },
      {
        onSuccess: () => {
          setOpen(false);
        },
      },
    );
  };

  return (
    <>
      <Button
        aria-label={`Pay off ${description} early`}
        onClick={() => {
          setOpen(true);
        }}
      >
        Pay off early
      </Button>
      <Dialog
        open={open}
        title={`Pay off ${description}`}
        onClose={() => {
          setOpen(false);
        }}
      >
        <form onSubmit={submit} className="flex flex-col gap-3">
          <p className="text-xs text-zinc-500">
            Every remaining instalment is billed now, and the future invoices
            they were on recalculate.
          </p>
          <Field
            label="Discount"
            value={discount}
            placeholder="0,00"
            onChange={(event) => {
              setDiscount(event.target.value);
            }}
            hint="Leave empty if there was none"
            {...(error === undefined ? {} : { error })}
          />
          <Button variant="primary" type="submit" disabled={payOff.isPending}>
            Pay off the rest
          </Button>
        </form>
      </Dialog>
    </>
  );
}
