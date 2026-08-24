import type { Cents } from '@fin/contracts';
import { useState } from 'react';

import {
  formatBRL,
  maskBRL,
  parseBRL,
  selectAll,
  todayIso,
} from '@/shared/lib';
import { Button, Dialog, Field } from '@/shared/ui';

import { useRecordBucketEvent } from '../api/use-manage-buckets.js';

interface Props {
  bucketId: string;
  bucketName: string;
  balance: Cents;
}

/**
 * UC-6.7 — what "editing the balance" means here.
 *
 * The balance is a fold over an append-only log, so it is never overwritten:
 * a correction is recorded beside the contributions it supersedes, carrying
 * the reason the two disagree. That is the whole point — the spreadsheet this
 * replaced hard-coded balances over its own running total and left no trace
 * of why.
 *
 * It is a control of its own rather than an option inside the general event
 * form because *the balance is wrong* is the thing a user comes looking for
 * by name, and a named action is what they can find.
 */
export function CorrectBalance({ bucketId, bucketName, balance }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        aria-label={`Corrigir o saldo de ${bucketName}`}
        onClick={() => {
          setOpen(true);
        }}
      >
        Corrigir saldo
      </Button>
      <Dialog
        open={open}
        title={`${bucketName} — corrigir o saldo`}
        onClose={() => {
          setOpen(false);
        }}
      >
        <Form
          bucketId={bucketId}
          balance={balance}
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
  balance,
  onDone,
}: {
  bucketId: string;
  balance: Cents;
  onDone: () => void;
}) {
  const record = useRecordBucketEvent(bucketId);
  // Opens on what the app currently believes, so the user edits a figure
  // rather than recalling one — unless it believes nothing, in which case
  // `0,00` is not a figure to edit but four characters to delete first.
  const [amount, setAmount] = useState(() =>
    balance === 0 ? '' : withoutSymbol(balance),
  );
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();

  const submit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    const cents = parseBRL(amount);

    if (cents === null) {
      setError('Informe um valor como 1.234,56.');
      return;
    }
    if (reason.trim() === '') {
      setError('Diga por que o saldo está sendo corrigido.');
      return;
    }

    record.mutate(
      {
        kind: 'CORRECTION',
        amount: Math.abs(cents),
        // The event log is ordered by date, so a correction has to say when it
        // was observed. The route requires it.
        date: todayIso(),
        reason: reason.trim(),
      },
      { onSuccess: onDone },
    );
  };

  const isReasonMissing = reason.trim() === '';

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field
        label="Saldo observado"
        value={amount}
        placeholder="1.234,56"
        inputMode="decimal"
        onChange={(event) => {
          setAmount(maskBRL(event.target.value));
        }}
        onFocus={selectAll}
        hint="O que a caixinha tem de verdade, não a diferença"
        {...(error !== undefined && !isReasonMissing ? { error } : {})}
      />

      <Field
        label="Motivo"
        value={reason}
        onChange={(event) => {
          setReason(event.target.value);
        }}
        hint="Obrigatório — um saldo que muda sem deixar rastro é o que isto substitui"
        {...(error !== undefined && isReasonMissing ? { error } : {})}
      />

      {/* A refused correction is said out loud rather than leaving the
          dialog looking like a button that does nothing. */}
      {record.isError && (
        <p role="alert" className="text-xs text-red-700">
          {record.error instanceof Error
            ? record.error.message
            : 'Não foi possível corrigir o saldo.'}
        </p>
      )}

      <Button variant="primary" type="submit" disabled={record.isPending}>
        Corrigir
      </Button>
    </form>
  );
}

/** `R$ 2.160,00` → `2.160,00`: a field is not the place for the symbol. */
function withoutSymbol(cents: Cents): string {
  return formatBRL(cents).replace(/^R\$\s*/u, '');
}
