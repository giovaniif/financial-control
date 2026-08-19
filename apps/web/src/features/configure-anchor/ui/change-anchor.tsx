import type { ShiftPolicy } from '@fin/contracts';
import { useState } from 'react';

import { ApiError } from '@/shared/api';
import { Button, Dialog, Field } from '@/shared/ui';

import {
  useChangeAnchor,
  usePreviewAnchorChange,
} from '../api/use-configure-anchor.js';

interface Props {
  anchorDay: number;
  shiftPolicy: ShiftPolicy;
}

const policies = {
  'O dia útil anterior': 'PRECEDING',
  'O dia útil seguinte': 'FOLLOWING',
} as const;

type PolicyLabel = keyof typeof policies;

/** UC-1.1 — the anchor decides where every cycle begins. */
export function ChangeAnchor({ anchorDay, shiftPolicy }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        Alterar o dia do pagamento
      </Button>
      <Dialog
        open={open}
        title="Dia do pagamento"
        onClose={() => {
          setOpen(false);
        }}
      >
        <Form
          anchorDay={anchorDay}
          shiftPolicy={shiftPolicy}
          onDone={() => {
            setOpen(false);
          }}
        />
      </Dialog>
    </>
  );
}

function Form({
  anchorDay,
  shiftPolicy,
  onDone,
}: Props & { onDone: () => void }) {
  const [day, setDay] = useState(String(anchorDay));
  const [policy, setPolicy] = useState<ShiftPolicy>(shiftPolicy);
  const [error, setError] = useState<string>();

  const preview = usePreviewAnchorChange();
  const change = useChangeAnchor();
  const proposal = { anchorDay: Number(day), shiftPolicy: policy };
  const blocked = (preview.data?.orphanedEntries ?? 0) > 0;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-zinc-500">
        Alterar o dia do pagamento redefine os limites de todos os ciclos em
        aberto. Os ciclos fechados nunca têm seus limites redefinidos.
      </p>

      <Field
        label="Dia do mês"
        type="number"
        value={day}
        onChange={(event) => {
          setDay(event.target.value);
        }}
        hint="Um dia além do fim de um mês curto cai no último dia dele"
      />

      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
        Quando cai num fim de semana ou feriado
        <select
          value={
            policy === 'PRECEDING'
              ? 'O dia útil anterior'
              : 'O dia útil seguinte'
          }
          onChange={(event) => {
            setPolicy(policies[event.target.value as PolicyLabel]);
          }}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-normal"
        >
          {Object.keys(policies).map((label) => (
            <option key={label}>{label}</option>
          ))}
        </select>
      </label>

      <Button
        disabled={preview.isPending}
        onClick={() => {
          setError(undefined);
          preview.mutate(proposal);
        }}
      >
        Pré-visualizar
      </Button>

      {preview.data !== undefined && (
        <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 text-xs">
          {/* What the change would do lands as it appears, not silently. */}
          <span role="alert">
            {preview.data.totalEntriesMoving} lançamentos mudariam de ciclo.
          </span>
          <ul className="flex flex-col gap-0.5 text-zinc-500">
            {preview.data.shifts.map((shift) => (
              <li key={shift.month}>
                {shift.month}: {shift.currentRange} → {shift.proposedRange}
              </li>
            ))}
          </ul>
          {blocked && (
            <span role="alert" className="text-red-700">
              {preview.data.orphanedEntries} lançamentos ficariam fora de todos
              os ciclos em aberto. Mova ou dê baixa neles primeiro.
            </span>
          )}
        </div>
      )}

      {error !== undefined && (
        <span role="alert" className="text-xs text-red-700">
          {error}
        </span>
      )}

      <Button
        variant="primary"
        disabled={preview.data === undefined || blocked || change.isPending}
        onClick={() => {
          change.mutate(proposal, {
            onSuccess: onDone,
            onError: (failure) => {
              // A 409 here is an explanation, not a status code.
              setError(
                failure instanceof ApiError
                  ? failure.message
                  : 'Não foi possível aplicar a mudança.',
              );
            },
          });
        }}
      >
        Aplicar a mudança
      </Button>
    </div>
  );
}
