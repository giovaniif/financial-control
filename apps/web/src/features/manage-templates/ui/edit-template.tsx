import type { EditScope, TemplateResponse } from '@fin/contracts';
import { useId, useState } from 'react';

import { formatBRL, parseBRL } from '@/shared/lib';
import { Button, Dialog, Field } from '@/shared/ui';

import {
  useChangeTemplateAmount,
  useUpdateTemplate,
} from '../api/use-manage-templates.js';

interface Props {
  template: TemplateResponse;
  /** Changes apply from here on; everything before it stays as it was. */
  currentMonth: string;
}

/** UC-2.3 – UC-2.6 — everything that changes a recurring item after it exists. */
export function EditTemplate({ template, currentMonth }: Props) {
  const [open, setOpen] = useState(false);
  const [changingAmount, setChangingAmount] = useState(false);

  return (
    <>
      <Button
        aria-label={`Edit ${template.name}`}
        onClick={() => {
          setOpen(true);
        }}
      >
        Edit
      </Button>
      <Dialog
        open={open}
        title={template.name}
        onClose={() => {
          setOpen(false);
          setChangingAmount(false);
        }}
      >
        {changingAmount ? (
          <AmountForm
            template={template}
            currentMonth={currentMonth}
            onDone={() => {
              setChangingAmount(false);
              setOpen(false);
            }}
          />
        ) : (
          <Menu
            template={template}
            onChangeAmount={() => {
              setChangingAmount(true);
            }}
            onDone={() => {
              setOpen(false);
            }}
          />
        )}
      </Dialog>
    </>
  );
}

function Menu({
  template,
  onChangeAmount,
  onDone,
}: {
  template: TemplateResponse;
  onChangeAmount: () => void;
  onDone: () => void;
}) {
  const update = useUpdateTemplate(template.id);
  const [name, setName] = useState(template.name);
  const [endMonth, setEndMonth] = useState(template.endMonth ?? '');
  const done = { onSuccess: onDone };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Button variant="primary" onClick={onChangeAmount}>
          Change amount
        </Button>
        <p className="text-xs text-zinc-500">
          Currently {formatBRL(template.amount)} on day {template.dueDayOfMonth}
          .
        </p>
      </div>

      <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3">
        <Field
          label="Name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        <Button
          disabled={update.isPending || name.trim() === ''}
          onClick={() => {
            update.mutate({ name: name.trim() }, done);
          }}
        >
          Rename
        </Button>
      </div>

      <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3">
        {/* Expenses end, and a paused one resumes with no data lost. */}
        {template.status === 'PAUSED' ? (
          <Button
            disabled={update.isPending}
            onClick={() => {
              update.mutate({ status: 'ACTIVE' }, done);
            }}
          >
            Resume
          </Button>
        ) : (
          <Button
            disabled={update.isPending}
            onClick={() => {
              update.mutate({ status: 'PAUSED' }, done);
            }}
          >
            Pause
          </Button>
        )}
        <Button
          disabled={update.isPending}
          onClick={() => {
            update.mutate({ isEstimate: !template.isEstimate }, done);
          }}
        >
          {template.isEstimate ? 'Confirm the amount' : 'Flag as an estimate'}
        </Button>
      </div>

      <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3">
        <Field
          label="End after cycle"
          placeholder="2026-12"
          value={endMonth}
          onChange={(event) => {
            setEndMonth(event.target.value);
          }}
          hint="Stops future generation. History is kept."
        />
        <Button
          disabled={update.isPending || endMonth.trim() === ''}
          onClick={() => {
            update.mutate({ endMonth: endMonth.trim() }, done);
          }}
        >
          End it
        </Button>
      </div>
    </div>
  );
}

/**
 * UC-2.3 — the scope choice. Neither option is preselected: which one is meant
 * is the entire question, and a default would answer it for the user.
 */
function AmountForm({
  template,
  currentMonth,
  onDone,
}: {
  template: TemplateResponse;
  currentMonth: string;
  onDone: () => void;
}) {
  const change = useChangeTemplateAmount(template.id);
  const [amount, setAmount] = useState(digitsOf(template.amount));
  const [scope, setScope] = useState<EditScope>();
  const [error, setError] = useState<string>();

  const submit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    const cents = parseBRL(amount);

    if (cents === null) {
      setError('Enter an amount like 1.234,56.');
      return;
    }
    if (scope === undefined) {
      setError(
        'Choose whether this applies to one cycle or to every cycle from here on.',
      );
      return;
    }

    change.mutate(
      { fromMonth: currentMonth, amount: Math.abs(cents), scope },
      { onSuccess: onDone },
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field
        label="New amount"
        value={amount}
        onChange={(event) => {
          setAmount(event.target.value);
        }}
        hint={`From ${currentMonth} onward`}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs font-medium text-zinc-600">
          What does this change?
        </legend>
        <Scope
          checked={scope === 'THIS_CYCLE_ONLY'}
          onSelect={() => {
            setScope('THIS_CYCLE_ONLY');
          }}
          title="This cycle only"
          body="Only this cycle changes. Every other cycle keeps the amount it has."
        />
        <Scope
          checked={scope === 'THIS_AND_FUTURE'}
          onSelect={() => {
            setScope('THIS_AND_FUTURE');
          }}
          title="This cycle and all future"
          body="This cycle and every one after it use the new amount, carried as one value schedule."
        />
      </fieldset>

      <p className="text-xs text-zinc-500">
        Past cycles are never touched, whichever you choose.
      </p>
      {error !== undefined && (
        <span role="alert" className="text-xs text-red-700">
          {error}
        </span>
      )}

      <Button variant="primary" type="submit" disabled={change.isPending}>
        Apply
      </Button>
    </form>
  );
}

function Scope({
  checked,
  onSelect,
  title,
  body,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  body: string;
}) {
  const id = useId();

  return (
    <div className="flex gap-2 rounded-lg border border-zinc-200 p-2 text-xs has-checked:border-zinc-400">
      <input
        id={id}
        type="radio"
        name="scope"
        checked={checked}
        onChange={onSelect}
        aria-describedby={`${id}-body`}
        className="mt-0.5"
      />
      <span className="flex flex-col gap-0.5">
        <label htmlFor={id} className="font-medium text-zinc-800">
          {title}
        </label>
        <span id={`${id}-body`} className="text-zinc-500">
          {body}
        </span>
      </span>
    </div>
  );
}

function digitsOf(cents: number): string {
  return formatBRL(cents).replace(/[^\d,-]/g, '');
}
