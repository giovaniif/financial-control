import { useState } from 'react';

import { maskBRL, parseBRL, selectAll, todayIso } from '@/shared/lib';
import { Button, Dialog, Field } from '@/shared/ui';

import { useRecordBucketEvent } from '../api/use-manage-buckets.js';

interface Props {
  bucketId: string;
  bucketName: string;
  month: string;
}

const kinds = {
  'Ajuste neste ciclo': 'OVERRIDE',
  Rendimento: 'YIELD',
  Correção: 'CORRECTION',
  Resgate: 'WITHDRAWAL',
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
        aria-label={`Registrar em ${bucketName}`}
        onClick={() => {
          setOpen(true);
        }}
      >
        Registrar
      </Button>
      <Dialog
        open={open}
        title={`${bucketName} — registrar evento`}
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
  const [label, setLabel] = useState<Label>('Ajuste neste ciclo');
  const [amount, setAmount] = useState('');
  // An empty date passes the route's type check and then fails to parse,
  // which reached the user as a button that did nothing.
  const [date, setDate] = useState(todayIso);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();

  const kind = kinds[label];
  // Only the two that rewrite history against the user's own judgement.
  const needsReason = kind === 'CORRECTION' || kind === 'WITHDRAWAL';

  const submit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    const cents = parseBRL(amount);

    if (cents === null) {
      setError('Informe um valor como 1.234,56.');
      return;
    }
    if (needsReason && reason.trim() === '') {
      setError(
        kind === 'CORRECTION'
          ? 'Diga por que o saldo está sendo corrigido.'
          : 'Diga por que o dinheiro está saindo.',
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
        O que aconteceu
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
        label="Valor"
        value={amount}
        placeholder="1.234,56"
        inputMode="decimal"
        onChange={(event) => {
          setAmount(maskBRL(event.target.value));
        }}
        onFocus={selectAll}
        {...(kind === 'OVERRIDE'
          ? { hint: `Em vez da regra, só para ${month}` }
          : {})}
        {...(kind === 'CORRECTION'
          ? { hint: 'O saldo observado, não a diferença' }
          : {})}
        {...(error !== undefined && !needsReason ? { error } : {})}
      />

      {kind !== 'OVERRIDE' && (
        <Field
          label="Data"
          type="date"
          value={date}
          onChange={(event) => {
            setDate(event.target.value);
          }}
        />
      )}

      {needsReason && (
        <Field
          label="Motivo"
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
          hint="Obrigatório — um saldo que muda sem deixar rastro é o que isto substitui"
          {...(error === undefined ? {} : { error })}
        />
      )}

      {record.isError && (
        <p role="alert" className="text-xs text-red-700">
          {record.error instanceof Error
            ? record.error.message
            : 'Não foi possível registrar.'}
        </p>
      )}

      <Button variant="primary" type="submit" disabled={record.isPending}>
        Registrar
      </Button>
    </form>
  );
}
