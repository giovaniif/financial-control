import type { InvoiceResponse } from '@fin/contracts';
import { useState } from 'react';

import { formatBRL, formatDate, parseBRL } from '@/shared/lib';
import { Button, Dialog, Field } from '@/shared/ui';

import { usePayInvoice } from '../api/use-pay-invoice.js';

interface Props {
  cardId: string;
  invoice: InvoiceResponse;
}

/** UC-5.5 — behaves exactly like settling a ledger entry, because it is one. */
export function PayInvoice({ cardId, invoice }: Props) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(digitsOf(Math.abs(invoice.total)));
  const [error, setError] = useState<string>();
  const pay = usePayInvoice(cardId, invoice.id);

  // An open invoice is still collecting purchases; a paid one is done.
  if (invoice.status !== 'CLOSED') {
    return null;
  }

  const submit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    const cents = parseBRL(amount);

    if (cents === null) {
      setError('Enter an amount like 1.234,56.');
      return;
    }

    pay.mutate(-Math.abs(cents), {
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
        Pay
      </Button>
      <Dialog
        open={open}
        title="Pay this invoice"
        onClose={() => {
          setOpen(false);
        }}
      >
        <form onSubmit={submit} className="flex flex-col gap-3">
          <p className="text-xs text-zinc-500">
            {formatBRL(invoice.total)} due {formatDate(invoice.dueDate)}, paid
            in the {invoice.paidInCycle} cycle.
          </p>
          <Field
            label="Amount paid"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
            }}
            {...(error === undefined ? {} : { error })}
          />
          <Button variant="primary" type="submit" disabled={pay.isPending}>
            Record the payment
          </Button>
        </form>
      </Dialog>
    </>
  );
}

function digitsOf(cents: number): string {
  return formatBRL(cents).replace(/[^\d,-]/g, '');
}
