import type { AnchorChangeRequest, ShiftPolicy } from '@fin/contracts';
import { useState } from 'react';

import { useChangeAnchor, useResolveAnchor } from '@/features/configure-anchor';
import { formatRange } from '@/shared/lib';
import { Button, Field, Skeleton } from '@/shared/ui';

/** Salary on the 5th, moving back off a closed bank — the app's default. */
const DEFAULT_ANCHOR: AnchorChangeRequest = {
  anchorDay: 5,
  shiftPolicy: 'PRECEDING',
};

const policies: { value: ShiftPolicy; label: string }[] = [
  { value: 'PRECEDING', label: 'o dia útil anterior' },
  { value: 'FOLLOWING', label: 'o dia útil seguinte' },
];

/** How many resolved cycles are enough to make the pattern obvious. */
const SHOWN = 3;

/**
 * UC-1.1 — the app's one genuinely counter-intuitive idea, shown as the real
 * boundaries the chosen anchor produces rather than described.
 */
export function AnchorSection() {
  const [anchor, onChange] = useState(DEFAULT_ANCHOR);
  const save = useChangeAnchor();
  const { data, isPending } = useResolveAnchor(anchor);
  const cycles = data?.cycles.slice(0, SHOWN) ?? [];
  /**
   * The field is edited as text so it can pass through empty and half-typed
   * states. Only a real day of the month is promoted to the anchor, which is
   * what keeps the resolved preview from flickering through nonsense.
   */
  const [typed, setTyped] = useState(String(anchor.anchorDay));

  const changeDay = (value: string) => {
    setTyped(value);
    const day = Number(value);
    if (Number.isInteger(day) && day >= 1 && day <= 31) {
      onChange({ ...anchor, anchorDay: day });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 text-zinc-600">
        <p>
          Este app não pensa em meses do calendário. Ele pensa em{' '}
          <strong className="font-medium text-zinc-900">
            ciclos de pagamento
          </strong>
          : de uma data de salário até o dia antes da próxima. É assim que o
          dinheiro é realmente vivido — um valor chega, e ele precisa cobrir
          tudo até o próximo valor chegar.
        </p>
        <p>
          Um ciclo é nomeado pelo mês em que é{' '}
          <strong className="font-medium text-zinc-900">gasto</strong>, então
          ele começa no pagamento do mês <em>anterior</em>.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="w-32">
          <Field
            label="Salário cai no dia"
            type="number"
            min={1}
            max={31}
            value={typed}
            onChange={(event) => {
              changeDay(event.target.value);
            }}
          />
        </div>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-xs font-medium text-zinc-500">
            Quando isso cai num fim de semana ou feriado, o pagamento vai para
          </legend>
          {policies.map((policy) => (
            <label
              key={policy.value}
              className="flex items-center gap-2 text-sm"
            >
              <input
                type="radio"
                name="shiftPolicy"
                value={policy.value}
                checked={anchor.shiftPolicy === policy.value}
                onChange={() => {
                  onChange({ ...anchor, shiftPolicy: policy.value });
                }}
              />
              {policy.label}
            </label>
          ))}
        </fieldset>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
          O que resulta nestes ciclos
        </p>
        {isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {cycles.map((cycle) => (
              <li key={cycle.month} className="flex items-center gap-3">
                <span className="w-36 font-medium">{cycle.label}</span>
                <span className="font-mono text-xs text-zinc-600">
                  {formatRange(cycle.start, cycle.end)}
                </span>
                {cycle.shifted && (
                  <span className="text-xs text-amber-700">
                    pagamento movido para fora de um dia fechado
                  </span>
                )}
                {cycle.clamped && (
                  <span className="text-xs text-amber-700">
                    ajustado para o último dia do mês
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {/* Day 30 would miss the 31st of the long months, so the last-day
            payday is expressed as 31 and clamped per month. */}
        <p className="text-xs text-zinc-500">
          Pago no último dia do mês? Use 31 — ele se ajusta ao tamanho de cada
          mês, então fevereiro também é resolvido corretamente.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          disabled={save.isPending}
          onClick={() => {
            save.mutate(anchor);
          }}
        >
          Salvar o dia do pagamento
        </Button>
        {save.isSuccess && (
          <span className="text-sm text-green-700">Salvo.</span>
        )}
        {save.isError && (
          <span role="alert" className="text-sm text-red-700">
            {save.error.message}
          </span>
        )}
      </div>
    </div>
  );
}
