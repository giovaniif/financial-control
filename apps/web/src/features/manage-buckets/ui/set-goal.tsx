import type { BucketView } from '@/entities/bucket';
import { useState } from 'react';

import { maskBRL, parseBRL, selectAll } from '@/shared/lib';
import { Button, Dialog, Field } from '@/shared/ui';

import { useUpdateBucket } from '../api/use-manage-buckets.js';

/**
 * UC-6.1 — a caixinha gains a target and becomes a goal, or loses one and
 * becomes an ongoing commitment.
 *
 * The mode is never chosen directly. It follows the target, because a goal
 * with nothing to reach is the state the progress figures have no answer
 * for — so the form asks the question that has an answer.
 */
export function SetGoal({ bucket }: { bucket: BucketView }) {
  const [open, setOpen] = useState(false);
  const update = useUpdateBucket(bucket.id);
  const isGoal = bucket.mode === 'GOAL';

  return (
    <>
      <Button
        aria-label={`${isGoal ? 'Alterar a meta de' : 'Definir uma meta para'} ${bucket.name}`}
        onClick={() => {
          setOpen(true);
        }}
      >
        {isGoal ? 'Alterar meta' : 'Definir meta'}
      </Button>
      <Dialog
        open={open}
        title={`Meta de ${bucket.name}`}
        onClose={() => {
          setOpen(false);
        }}
      >
        <GoalForm
          bucket={bucket}
          onDone={() => {
            setOpen(false);
          }}
          update={update}
        />
      </Dialog>
    </>
  );
}

function GoalForm({
  bucket,
  onDone,
  update,
}: {
  bucket: BucketView;
  onDone: () => void;
  update: ReturnType<typeof useUpdateBucket>;
}) {
  // An ongoing bucket has no target to read at all, which is the point of the
  // union — the form starts empty rather than around a null.
  const [amount, setAmount] = useState(
    bucket.mode === 'GOAL' ? maskBRL(String(bucket.target)) : '',
  );
  const [date, setDate] = useState(
    bucket.mode === 'GOAL' ? bucket.targetDate : '',
  );
  const [error, setError] = useState<string | undefined>(undefined);

  const save = () => {
    const cents = parseBRL(amount);
    if (cents === null || cents <= 0) {
      setError('Digite um valor maior que zero, como 60.000,00.');
      return;
    }
    if (date === '') {
      setError('Uma meta precisa de uma data para ser atingida.');
      return;
    }
    setError(undefined);
    update.mutate({ target: { amount: cents, date } }, { onSuccess: onDone });
  };

  return (
    <div className="flex flex-col gap-3">
      <Field
        label="Quanto quer juntar"
        inputMode="decimal"
        value={amount}
        onFocus={selectAll}
        onChange={(event) => {
          setAmount(maskBRL(event.target.value));
        }}
      />
      <Field
        label="Até quando"
        type="date"
        value={date}
        onChange={(event) => {
          setDate(event.target.value);
        }}
      />

      {error !== undefined && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {update.isError && (
        <p role="alert" className="text-sm text-red-700">
          Não foi possível salvar a meta.
        </p>
      )}

      <Button variant="primary" disabled={update.isPending} onClick={save}>
        Salvar meta
      </Button>

      {/* Dropping the target is not archiving: nothing ends, the caixinha
          simply stops having a finish line. */}
      {bucket.mode === 'GOAL' && (
        <Button
          disabled={update.isPending}
          onClick={() => {
            update.mutate({ target: null }, { onSuccess: onDone });
          }}
        >
          Tirar a meta e deixar contínua
        </Button>
      )}
    </div>
  );
}
