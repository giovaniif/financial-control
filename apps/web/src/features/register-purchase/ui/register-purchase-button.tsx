import { useState } from 'react';

import { formatBRL, formatDate, parseBRL } from '@/shared/lib';
import { Button, Dialog, Field } from '@/shared/ui';

import {
  useBillingPreview,
  useRegisterPurchase,
} from '../api/use-register-purchase.js';

interface Props {
  cardId: string;
  cardName: string;
}

/** UC-5.1, UC-5.2, UC-5.7 — the card write path, with the cycle it hits. */
export function RegisterPurchaseButton({ cardId, cardName }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="primary"
        onClick={() => {
          setOpen(true);
        }}
      >
        Register a purchase
      </Button>
      <Dialog
        open={open}
        title={`New purchase on ${cardName}`}
        onClose={() => {
          setOpen(false);
        }}
      >
        <Form
          cardId={cardId}
          onDone={() => {
            setOpen(false);
          }}
        />
      </Dialog>
    </>
  );
}

function Form({ cardId, onDone }: { cardId: string; onDone: () => void }) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [purchasedOn, setPurchasedOn] = useState('');
  const [installments, setInstallments] = useState('1');
  const [isRefund, setIsRefund] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const register = useRegisterPurchase(cardId);
  const preview = useBillingPreview(cardId, purchasedOn);

  const cents = parseBRL(amount);
  const count = Number(installments);
  const perInstallment =
    cents !== null && Number.isInteger(count) && count > 1
      ? Math.round(Math.abs(cents) / count)
      : null;

  const submit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    const found: Record<string, string> = {};

    if (description.trim() === '') {
      found['description'] = 'Say what was bought.';
    }
    if (cents === null) {
      found['amount'] = 'Enter an amount like 1.234,56.';
    }
    if (!Number.isInteger(count) || count < 1) {
      found['installments'] = 'At least one.';
    }

    setErrors(found);
    if (Object.keys(found).length > 0 || cents === null) {
      return;
    }

    register.mutate(
      {
        description: description.trim(),
        purchasedOn,
        amount: Math.abs(cents),
        installments: count,
        isRefund,
      },
      { onSuccess: onDone },
    );
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
      <Field
        label="Purchase date"
        type="date"
        value={purchasedOn}
        onChange={(event) => {
          setPurchasedOn(event.target.value);
        }}
      />
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
        label="Instalments"
        type="number"
        value={installments}
        onChange={(event) => {
          setInstallments(event.target.value);
        }}
        {...(perInstallment === null
          ? {}
          : {
              hint: `${String(count)} × ${formatBRL(perInstallment)} — the last one absorbs the rounding`,
            })}
        {...(errors['installments'] === undefined
          ? {}
          : { error: errors['installments'] })}
      />
      <label className="flex items-center gap-2 text-xs text-zinc-600">
        <input
          type="checkbox"
          checked={isRefund}
          onChange={(event) => {
            setIsRefund(event.target.checked);
          }}
        />
        This is a refund
      </label>

      {/* The one thing this form exists to make obvious. */}
      {preview.data !== undefined && (
        <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          This will be billed {formatDate(preview.data.dueDate)}, in the{' '}
          {preview.data.cycleLabel} cycle.
        </p>
      )}

      <Button variant="primary" type="submit" disabled={register.isPending}>
        Register
      </Button>
    </form>
  );
}
