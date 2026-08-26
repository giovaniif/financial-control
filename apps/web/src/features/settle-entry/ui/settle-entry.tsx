import { useState } from 'react';

import { formatBRL, maskBRL, parseBRL, selectAll } from '@/shared/lib';
import { Button, Dialog, Field } from '@/shared/ui';

import { useSettleEntry } from '../api/use-settle-entry.js';

interface Props {
  month: string;
  entryId: string;
  /** Money in is received; money out is paid. */
  planned: number;
  /**
   * An unconfirmed figure (UC-2.6). Settling one in a click would record a
   * guess as a fact, so it asks first.
   */
  isEstimate?: boolean;
}

const settlementOf = (planned: number) =>
  planned > 0 ? ('RECEIVED' as const) : ('PAID' as const);

/**
 * UC-3.5 — one click when the actual equals the planned amount, two when it
 * does not. The one-click path stays a single button: this is the most
 * repeated action in the app, and burying it behind a form would be felt
 * every day.
 *
 * An estimate is the exception. `~estimativa` says nobody has confirmed the
 * figure, so settling it silently would turn the guess into a fact and the
 * tag would stop meaning anything — it opens the form instead, prefilled.
 */
export function SettleEntry({ month, entryId, planned, isEstimate }: Props) {
  const [open, setOpen] = useState(false);
  const settle = useSettleEntry();
  const isIncoming = planned > 0;

  return (
    <>
      <Button
        disabled={settle.isPending}
        onClick={() => {
          if (isEstimate === true) {
            setOpen(true);
            return;
          }
          settle.mutate({ month, entryId, status: settlementOf(planned) });
        }}
      >
        {isIncoming ? 'Confirmar' : 'Pagar'}
      </Button>
      <ActualDialog
        month={month}
        entryId={entryId}
        planned={planned}
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      />
    </>
  );
}

/**
 * The same settlement, with the amount asked for. A menu item rather than a
 * second button beside the first: it is the rarer of the two.
 */
export function SettleWithAmount({ month, entryId, planned }: Props) {
  const [open, setOpen] = useState(false);
  const isIncoming = planned > 0;

  return (
    <>
      <Button
        aria-label={
          isIncoming ? 'Confirmar com outro valor' : 'Pagar com outro valor'
        }
        onClick={() => {
          setOpen(true);
        }}
      >
        {isIncoming ? 'Confirmar com outro valor' : 'Pagar com outro valor'}
      </Button>
      <ActualDialog
        month={month}
        entryId={entryId}
        planned={planned}
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      />
    </>
  );
}

/**
 * UC-3.5 — a plan that never happened, which is not the same as one paid at
 * zero. It needs no amount, so it asks for nothing.
 */
export function SkipEntry({
  month,
  entryId,
  description,
}: {
  month: string;
  entryId: string;
  description: string;
}) {
  const settle = useSettleEntry();

  return (
    <Button
      aria-label={`Ignorar ${description} neste mês`}
      disabled={settle.isPending}
      onClick={() => {
        settle.mutate({ month, entryId, status: 'SKIPPED' });
      }}
    >
      Ignorar neste mês
    </Button>
  );
}

function ActualDialog({
  month,
  entryId,
  planned,
  open,
  onClose,
}: {
  month: string;
  entryId: string;
  planned: number;
  open: boolean;
  onClose: () => void;
}) {
  const settle = useSettleEntry();
  const isIncoming = planned > 0;

  return (
    <Dialog
      open={open}
      title={
        isIncoming ? 'Confirmar o que chegou' : 'Dar baixa pelo valor pago'
      }
      onClose={onClose}
    >
      <ActualForm
        planned={planned}
        isPending={settle.isPending}
        isError={settle.isError}
        onSave={(magnitude) => {
          settle.mutate(
            {
              month,
              entryId,
              status: settlementOf(planned),
              actual: isIncoming ? magnitude : -magnitude,
            },
            { onSuccess: onClose },
          );
        }}
      />
    </Dialog>
  );
}

function ActualForm({
  planned,
  isPending,
  isError,
  onSave,
}: {
  planned: number;
  isPending: boolean;
  isError: boolean;
  onSave: (magnitude: number) => void;
}) {
  // Prefilled with the plan, because the actual usually matches it.
  const [actual, setActual] = useState(maskBRL(String(Math.abs(planned))));
  const [error, setError] = useState<string>();

  const submit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    const cents = parseBRL(actual);

    if (cents === null) {
      setError('Digite um valor como 1.234,56.');
      return;
    }
    onSave(Math.abs(cents));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field
        label="Valor realizado"
        inputMode="decimal"
        value={actual}
        onFocus={selectAll}
        onChange={(event) => {
          setActual(maskBRL(event.target.value));
        }}
        hint={`Previsto ${formatBRL(planned)}`}
        {...(error === undefined ? {} : { error })}
      />
      {isError && (
        <p role="alert" className="text-sm text-red-700">
          Não foi possível dar baixa neste lançamento.
        </p>
      )}
      <Button variant="primary" type="submit" disabled={isPending}>
        Salvar
      </Button>
    </form>
  );
}
