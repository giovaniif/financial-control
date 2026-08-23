import type { CreateTemplateRequest, Direction } from '@fin/contracts';
import { useState } from 'react';

import { parseBRL } from '@/shared/lib';
import { Button, Dialog, Field } from '@/shared/ui';

import { useCreateTemplate } from '../api/use-manage-templates.js';
import { DirectionSelect } from './direction-select.js';

interface Props {
  /** The cycle the new item starts generating from. */
  currentMonth: string;
  /** What the button says, and what the form is titled. */
  label?: string;
  /**
   * Fixes the direction when the caller already knows it — a screen that asks
   * for income and for bills separately has answered this question already,
   * and asking it again makes the two forms the same form.
   */
  direction?: Direction;
}

/** UC-2.1, UC-2.2 — the engine that fills every future cycle. */
export function CreateTemplateButton({
  currentMonth,
  label = 'Add a bill',
  direction: fixedDirection,
}: Props) {
  const [open, setOpen] = useState(false);
  const create = useCreateTemplate();

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [chosenDirection, setDirection] = useState<Direction>('OUT');
  const [dueDay, setDueDay] = useState('5');
  // UC-2.6 — a guess is something the user says, never something the form
  // assumes, so a forecast never quietly mixes a guess with a known bill.
  const [isEstimate, setIsEstimate] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const direction = fixedDirection ?? chosenDirection;

  const submit = (event: { preventDefault: () => void }) => {
    event.preventDefault();

    const cents = parseBRL(amount);
    const day = Number(dueDay);
    const found: Record<string, string> = {};

    if (name.trim() === '') {
      found['name'] = 'Give it a name.';
    }
    if (cents === null) {
      found['amount'] = 'Enter an amount like 1.234,56.';
    }
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      found['dueDay'] = 'A day between 1 and 31.';
    }

    setErrors(found);
    if (Object.keys(found).length > 0 || cents === null) {
      return;
    }

    const template: CreateTemplateRequest = {
      name: name.trim(),
      direction,
      dueDayOfMonth: day,
      amount: Math.abs(cents),
      startMonth: currentMonth,
      isEstimate,
    };

    create.mutate(template, {
      onSuccess: () => {
        setOpen(false);
      },
    });
  };

  return (
    <>
      <Button
        variant="primary"
        onClick={() => {
          setOpen(true);
        }}
      >
        {label}
      </Button>
      <Dialog
        open={open}
        title={label}
        onClose={() => {
          setOpen(false);
        }}
      >
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field
            label="Name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
            {...(errors['name'] === undefined ? {} : { error: errors['name'] })}
          />
          {fixedDirection === undefined && (
            <DirectionSelect value={direction} onChange={setDirection} />
          )}
          <Field
            label="Amount"
            value={amount}
            placeholder="1.234,56"
            onChange={(event) => {
              setAmount(event.target.value);
            }}
            {...(errors['amount'] === undefined
              ? {}
              : { error: errors['amount'] })}
          />
          <Field
            label="Due day of month"
            type="number"
            value={dueDay}
            onChange={(event) => {
              setDueDay(event.target.value);
            }}
            hint="A day past the end of a short month falls on its last day"
            {...(errors['dueDay'] === undefined
              ? {}
              : { error: errors['dueDay'] })}
          />
          <label className="flex items-center gap-2 text-xs text-zinc-600">
            <input
              type="checkbox"
              checked={isEstimate}
              onChange={(event) => {
                setIsEstimate(event.target.checked);
              }}
            />
            Unconfirmed estimate
          </label>
          <Button variant="primary" type="submit" disabled={create.isPending}>
            Create
          </Button>
        </form>
      </Dialog>
    </>
  );
}
