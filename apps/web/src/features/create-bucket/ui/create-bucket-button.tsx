import type { AllocationRuleRequest, BucketMode } from '@fin/contracts';
import { useState } from 'react';

import { parseBRL } from '@/shared/lib';
import { Button, Dialog, Field } from '@/shared/ui';

import {
  useCreateBucket,
  type CreateBucketRequest,
} from '../api/use-create-bucket.js';

interface Props {
  /** New buckets fund last, behind everything already committed to. */
  existingCount: number;
}

/** UC-6.1 / UC-6.2 — a pot of savings and the rule that feeds it. */
export function CreateBucketButton({ existingCount }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="primary"
        onClick={() => {
          setOpen(true);
        }}
      >
        Add a bucket
      </Button>
      <Dialog
        open={open}
        title="Add a bucket"
        onClose={() => {
          setOpen(false);
        }}
      >
        <Form
          priority={existingCount + 1}
          onDone={() => {
            setOpen(false);
          }}
        />
      </Dialog>
    </>
  );
}

function Form({ priority, onDone }: { priority: number; onDone: () => void }) {
  const create = useCreateBucket();
  const [mode, setMode] = useState<BucketMode>('GOAL');
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [ruleKind, setRuleKind] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [percent, setPercent] = useState('10');
  const [amount, setAmount] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    const found: Record<string, string> = {};
    const targetCents = parseBRL(target);
    const amountCents = parseBRL(amount);
    const percentValue = Number(percent);

    if (name.trim() === '') {
      found['name'] = 'Name the bucket.';
    }

    // A goal must have both, or "percent complete" is a question about
    // nothing — see UC-6.1.
    if (mode === 'GOAL' && targetCents === null) {
      found['target'] = 'A goal needs a target.';
    }
    if (mode === 'GOAL' && targetDate === '') {
      found['targetDate'] = 'A goal needs the date you want it by.';
    }

    if (ruleKind === 'PERCENT' && !(percentValue > 0 && percentValue <= 100)) {
      found['percent'] = 'A share between 0 and 100.';
    }
    if (ruleKind === 'FIXED' && amountCents === null) {
      found['amount'] = 'Enter an amount like 1.234,56.';
    }

    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }

    const rule: AllocationRuleRequest =
      ruleKind === 'PERCENT'
        ? { kind: 'PERCENT', percent: percentValue }
        : { kind: 'FIXED', amount: Math.abs(amountCents ?? 0) };

    const bucket: CreateBucketRequest =
      mode === 'GOAL'
        ? {
            mode,
            name: name.trim(),
            target: Math.abs(targetCents ?? 0),
            targetDate,
            rule,
            priority,
          }
        : { mode, name: name.trim(), rule, priority };

    create.mutate(bucket, { onSuccess: onDone });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-xs font-medium text-zinc-600">
          What kind of bucket is it?
        </legend>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="mode"
            className="mt-1"
            checked={mode === 'GOAL'}
            onChange={() => {
              setMode('GOAL');
            }}
          />
          <span>
            <strong className="font-medium">Goal</strong> — a target amount by a
            target date
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="mode"
            className="mt-1"
            checked={mode === 'ONGOING'}
            onChange={() => {
              setMode('ONGOING');
            }}
          />
          <span>
            <strong className="font-medium">Ongoing</strong> — a per-cycle
            amount with no finish line
          </span>
        </label>
      </fieldset>

      <Field
        label="Name"
        value={name}
        onChange={(event) => {
          setName(event.target.value);
        }}
        {...(errors['name'] === undefined ? {} : { error: errors['name'] })}
      />

      {mode === 'GOAL' && (
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Target"
            value={target}
            placeholder="150.000,00"
            onChange={(event) => {
              setTarget(event.target.value);
            }}
            {...(errors['target'] === undefined
              ? {}
              : { error: errors['target'] })}
          />
          <Field
            label="Target date"
            type="date"
            value={targetDate}
            onChange={(event) => {
              setTargetDate(event.target.value);
            }}
            {...(errors['targetDate'] === undefined
              ? {}
              : { error: errors['targetDate'] })}
          />
        </div>
      )}

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-xs font-medium text-zinc-600">
          How much goes in each cycle?
        </legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="rule"
            checked={ruleKind === 'PERCENT'}
            onChange={() => {
              setRuleKind('PERCENT');
            }}
          />
          A share of Expected Surplus
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="rule"
            checked={ruleKind === 'FIXED'}
            onChange={() => {
              setRuleKind('FIXED');
            }}
          />
          A fixed amount
        </label>
      </fieldset>

      {ruleKind === 'PERCENT' ? (
        <Field
          label="Percent of Expected Surplus"
          type="number"
          value={percent}
          onChange={(event) => {
            setPercent(event.target.value);
          }}
          {...(errors['percent'] === undefined
            ? {}
            : { error: errors['percent'] })}
        />
      ) : (
        <Field
          label="Amount per cycle"
          value={amount}
          placeholder="1.778,00"
          onChange={(event) => {
            setAmount(event.target.value);
          }}
          {...(errors['amount'] === undefined
            ? {}
            : { error: errors['amount'] })}
        />
      )}

      <p className="text-xs text-zinc-500">
        Funds {ordinal(priority)} when Expected Surplus does not cover every
        rule.
      </p>

      <Button variant="primary" type="submit" disabled={create.isPending}>
        Add
      </Button>
    </form>
  );
}

function ordinal(value: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const remainder = value % 100;

  return `${String(value)}${suffixes[(remainder - 20) % 10] ?? suffixes[remainder] ?? suffixes[0] ?? 'th'}`;
}
