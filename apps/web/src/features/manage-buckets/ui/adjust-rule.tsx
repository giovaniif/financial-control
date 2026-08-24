import type { BucketResponse } from '@fin/contracts';
import { useState } from 'react';

import {
  formatBRL,
  formatMonthLabel,
  formatPercent,
  maskBRL,
  parseBRL,
  selectAll,
} from '@/shared/lib';
import { Button, Dialog, Field } from '@/shared/ui';

import {
  useAllocationPreview,
  useUpdateBucket,
} from '../api/use-manage-buckets.js';

interface Props {
  /** Only what the rule is made of — the form has no business with a target. */
  bucket: Pick<
    BucketResponse,
    'id' | 'name' | 'rule' | 'priority' | 'expectedYieldPercent'
  >;
  month: string;
}

/** UC-6.2, UC-6.3, UC-6.4, UC-7.1 — how much a bucket gets, and in what order. */
export function AdjustRule({ bucket, month }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        aria-label={`Ajustar a regra de ${bucket.name}`}
        onClick={() => {
          setOpen(true);
        }}
      >
        Ajustar
      </Button>
      <Dialog
        open={open}
        title={`${bucket.name} — alocação`}
        onClose={() => {
          setOpen(false);
        }}
      >
        <Form bucket={bucket} month={month} />
      </Dialog>
    </>
  );
}

function Form({ bucket, month }: Props) {
  const update = useUpdateBucket(bucket.id);
  const preview = useAllocationPreview(month);
  const expectedSurplus = preview.data?.expectedSurplus ?? 0;

  const [kind, setKind] = useState(bucket.rule.kind);
  const [percent, setPercent] = useState(
    bucket.rule.kind === 'PERCENT' ? String(bucket.rule.percent) : '20',
  );
  const [amount, setAmount] = useState(
    bucket.rule.kind === 'FIXED' ? digitsOf(bucket.rule.amount) : '',
  );
  const [priority, setPriority] = useState(String(bucket.priority));
  const [yieldPercent, setYieldPercent] = useState(
    String(bucket.expectedYieldPercent ?? 0),
  );
  const [error, setError] = useState<string>();

  const saveRule = () => {
    if (kind === 'PERCENT') {
      const value = Number(percent);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        setError('Entre 0 e 100.');
        return;
      }
      update.mutate({ rule: { kind: 'PERCENT', percent: value } });
      return;
    }

    const cents = parseBRL(amount);
    if (cents === null) {
      setError('Informe um valor como 1.234,56.');
      return;
    }
    update.mutate({ rule: { kind: 'FIXED', amount: Math.abs(cents) } });
  };

  return (
    <div className="flex flex-col gap-4">
      <Overcommitment preview={preview.data} month={month} />

      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
          Regra
          <select
            value={kind === 'PERCENT' ? 'Percentual' : 'Valor fixo'}
            onChange={(event) => {
              setKind(
                event.target.value === 'Percentual' ? 'PERCENT' : 'FIXED',
              );
            }}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-normal"
          >
            <option>Percentual</option>
            <option>Valor fixo</option>
          </select>
        </label>

        {kind === 'PERCENT' ? (
          <Field
            label="Percentual"
            type="number"
            value={percent}
            inputMode="decimal"
            onChange={(event) => {
              setPercent(event.target.value);
            }}
            onFocus={selectAll}
            {...(error === undefined ? {} : { error })}
          />
        ) : (
          <Field
            label="Valor por ciclo"
            value={amount}
            placeholder="1.778,00"
            inputMode="decimal"
            onChange={(event) => {
              setAmount(maskBRL(event.target.value));
            }}
            onFocus={selectAll}
            {...(error === undefined ? {} : { error })}
          />
        )}

        {/* The choice is made with both readings visible. */}
        <BothWays
          kind={kind}
          percent={Number(percent)}
          amount={parseBRL(amount) ?? 0}
          expectedSurplus={expectedSurplus}
        />

        <Button
          variant="primary"
          disabled={update.isPending}
          onClick={saveRule}
        >
          Salvar a regra
        </Button>
      </div>

      <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3">
        <Field
          label="Prioridade"
          type="number"
          value={priority}
          onChange={(event) => {
            setPriority(event.target.value);
          }}
          hint="A mais baixa primeiro quando falta dinheiro"
        />
        <Button
          disabled={update.isPending}
          onClick={() => {
            update.mutate({ priority: Number(priority) });
          }}
        >
          Salvar prioridade
        </Button>
      </div>

      <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3">
        <Field
          label="Rendimento anual esperado"
          type="number"
          value={yieldPercent}
          onChange={(event) => {
            setYieldPercent(event.target.value);
          }}
          hint="Uma premissa, não uma promessa — é rotulada como tal onde quer que mova um número"
        />
        <Button
          disabled={update.isPending}
          onClick={() => {
            update.mutate({ expectedYieldPercent: Number(yieldPercent) });
          }}
        >
          Salvar o rendimento
        </Button>
      </div>
    </div>
  );
}

function BothWays({
  kind,
  percent,
  amount,
  expectedSurplus,
}: {
  kind: 'PERCENT' | 'FIXED';
  percent: number;
  amount: number;
  expectedSurplus: number;
}) {
  if (expectedSurplus <= 0) {
    return (
      <p className="text-xs text-zinc-500">
        Este ciclo não tem Sobra Esperada para alocar.
      </p>
    );
  }

  if (kind === 'PERCENT') {
    const cents = Math.round((expectedSurplus * percent) / 100);

    return (
      <p className="text-xs text-zinc-500">
        {formatPercent(percent)} → {formatBRL(cents)} neste ciclo.
      </p>
    );
  }

  const share = (amount / expectedSurplus) * 100;

  return (
    <p className="text-xs text-zinc-500">
      {formatBRL(amount)} → {formatPercent(share, 1)} da Sobra Esperada deste
      ciclo.
    </p>
  );
}

/**
 * UC-6.4 — a shortfall is named concretely: the cycle, how much is missing,
 * and which buckets the priority order would actually fund.
 */
function Overcommitment({
  preview,
  month,
}: {
  preview:
    | {
        shortfall: number;
        isOvercommitted: boolean;
        fundings: readonly {
          bucketId: string;
          name: string;
          funded: number;
          isFullyFunded: boolean;
        }[];
      }
    | undefined;
  month: string;
}) {
  if (preview?.isOvercommitted !== true) {
    return null;
  }

  return (
    <div
      role="alert"
      className="flex flex-col gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
    >
      <span>
        Falta {formatBRL(preview.shortfall)} para cobrir as regras em{' '}
        {formatMonthLabel(month)}. A ordem de prioridade financia:
      </span>
      <ul>
        {preview.fundings.map((funding) => (
          <li key={funding.bucketId}>
            {funding.name} recebe {formatBRL(funding.funded)}
            {funding.isFullyFunded ? '' : ' — não tudo o que pediu'}
          </li>
        ))}
      </ul>
    </div>
  );
}

function digitsOf(cents: number): string {
  return formatBRL(cents).replace(/[^\d,-]/g, '');
}
