import type { BucketResponse } from '@fin/contracts';
import { useState } from 'react';

import { formatBRL, parseBRL } from '@/shared/lib';
import { Button, Dialog, Field } from '@/shared/ui';

import {
  useAllocationPreview,
  useUpdateBucket,
} from '../api/use-manage-buckets.js';

interface Props {
  bucket: BucketResponse;
  month: string;
}

/** UC-6.2, UC-6.3, UC-6.4, UC-7.1 — how much a bucket gets, and in what order. */
export function AdjustRule({ bucket, month }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        aria-label={`Adjust the rule for ${bucket.name}`}
        onClick={() => {
          setOpen(true);
        }}
      >
        Adjust
      </Button>
      <Dialog
        open={open}
        title={`${bucket.name} — allocation`}
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
        setError('Between 0 and 100.');
        return;
      }
      update.mutate({ rule: { kind: 'PERCENT', percent: value } });
      return;
    }

    const cents = parseBRL(amount);
    if (cents === null) {
      setError('Enter an amount like 1.234,56.');
      return;
    }
    update.mutate({ rule: { kind: 'FIXED', amount: Math.abs(cents) } });
  };

  return (
    <div className="flex flex-col gap-4">
      <Overcommitment preview={preview.data} month={month} />

      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
          Rule
          <select
            value={kind === 'PERCENT' ? 'Percentage' : 'Fixed amount'}
            onChange={(event) => {
              setKind(
                event.target.value === 'Percentage' ? 'PERCENT' : 'FIXED',
              );
            }}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-normal"
          >
            <option>Percentage</option>
            <option>Fixed amount</option>
          </select>
        </label>

        {kind === 'PERCENT' ? (
          <Field
            label="Percentage"
            type="number"
            value={percent}
            onChange={(event) => {
              setPercent(event.target.value);
            }}
            {...(error === undefined ? {} : { error })}
          />
        ) : (
          <Field
            label="Amount per cycle"
            value={amount}
            placeholder="1.778,00"
            onChange={(event) => {
              setAmount(event.target.value);
            }}
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
          Save the rule
        </Button>
      </div>

      <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3">
        <Field
          label="Priority"
          type="number"
          value={priority}
          onChange={(event) => {
            setPriority(event.target.value);
          }}
          hint="Lowest first when the money runs short"
        />
        <Button
          disabled={update.isPending}
          onClick={() => {
            update.mutate({ priority: Number(priority) });
          }}
        >
          Save priority
        </Button>
      </div>

      <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3">
        <Field
          label="Expected annual yield"
          type="number"
          value={yieldPercent}
          onChange={(event) => {
            setYieldPercent(event.target.value);
          }}
          hint="An assumption, not a promise — it is labelled as one wherever it moves a number"
        />
        <Button
          disabled={update.isPending}
          onClick={() => {
            update.mutate({ expectedYieldPercent: Number(yieldPercent) });
          }}
        >
          Save the yield
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
        This cycle has no Expected Surplus to allocate from.
      </p>
    );
  }

  if (kind === 'PERCENT') {
    const cents = Math.round((expectedSurplus * percent) / 100);

    return (
      <p className="text-xs text-zinc-500">
        {percent}% → {formatBRL(cents)} in this cycle.
      </p>
    );
  }

  const share = ((amount / expectedSurplus) * 100).toFixed(1).replace('.', ',');

  return (
    <p className="text-xs text-zinc-500">
      {formatBRL(amount)} → {share}% of this cycle&rsquo;s Expected Surplus.
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
        The rules run {formatBRL(preview.shortfall)} short in {month}. The
        priority order funds:
      </span>
      <ul>
        {preview.fundings.map((funding) => (
          <li key={funding.bucketId}>
            {funding.name} gets {formatBRL(funding.funded)}
            {funding.isFullyFunded ? '' : ' — not all it asked for'}
          </li>
        ))}
      </ul>
    </div>
  );
}

function digitsOf(cents: number): string {
  return formatBRL(cents).replace(/[^\d,-]/g, '');
}
