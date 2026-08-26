import { useState } from 'react';

import { formatBRL, maskBRL, parseBRL, selectAll } from '@/shared/lib';
import { Button, Dialog, Field } from '@/shared/ui';

import { useOverrideEntry } from '../api/use-override-entry.js';

interface Props {
  month: string;
  entryId: string;
  description: string;
  /** Signed: money out is negative, and the override keeps that direction. */
  planned: number;
}

/**
 * UC-3.7 — this cycle's figure, changed on its own.
 *
 * Not the same as settling for a different amount, and the wording has to
 * keep them apart: this changes what the cycle *expects* before anything is
 * paid, and leaves the recurring bill and every other cycle alone.
 */
export function OverrideEntry({ month, entryId, description, planned }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        aria-label={`Mudar o valor de ${description} neste mês`}
        onClick={() => {
          setOpen(true);
        }}
      >
        Mudar o valor deste mês
      </Button>
      <Dialog
        open={open}
        title={`Valor de ${description} neste mês`}
        onClose={() => {
          setOpen(false);
        }}
      >
        <OverrideForm
          month={month}
          entryId={entryId}
          planned={planned}
          onDone={() => {
            setOpen(false);
          }}
        />
      </Dialog>
    </>
  );
}

function OverrideForm({
  month,
  entryId,
  planned,
  onDone,
}: {
  month: string;
  entryId: string;
  planned: number;
  onDone: () => void;
}) {
  const override = useOverrideEntry();
  const [amount, setAmount] = useState(maskBRL(String(Math.abs(planned))));
  const [error, setError] = useState<string>();

  const submit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    const cents = parseBRL(amount);

    if (cents === null || cents === 0) {
      setError('Digite um valor como 1.234,56.');
      return;
    }
    // The direction belongs to the entry, not to what was typed: a bill is a
    // bill whichever sign the user reached for.
    const signed = planned < 0 ? -Math.abs(cents) : Math.abs(cents);
    override.mutate({ month, entryId, amount: signed }, { onSuccess: onDone });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field
        label="Valor neste ciclo"
        inputMode="decimal"
        value={amount}
        onFocus={selectAll}
        onChange={(event) => {
          setAmount(maskBRL(event.target.value));
        }}
        hint={`Projetado ${formatBRL(planned)}. Os outros ciclos não mudam.`}
        {...(error === undefined ? {} : { error })}
      />
      {override.isError && (
        <p role="alert" className="text-sm text-red-700">
          Não foi possível mudar o valor deste ciclo.
        </p>
      )}
      <Button variant="primary" type="submit" disabled={override.isPending}>
        Salvar
      </Button>
    </form>
  );
}
