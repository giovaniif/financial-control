import type { EditScope, TemplateResponse } from '@fin/contracts';
import { useId, useState } from 'react';

import { formatBRL, parseBRL, selectAll } from '@/shared/lib';
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
        aria-label={`Editar ${template.name}`}
        onClick={() => {
          setOpen(true);
        }}
      >
        Editar
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
          Alterar valor
        </Button>
        <p className="text-xs text-zinc-500">
          Atualmente {formatBRL(template.amount)} no dia{' '}
          {template.dueDayOfMonth}.
        </p>
      </div>

      <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3">
        <Field
          label="Nome"
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
          Renomear
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
            Retomar
          </Button>
        ) : (
          <Button
            disabled={update.isPending}
            onClick={() => {
              update.mutate({ status: 'PAUSED' }, done);
            }}
          >
            Pausar
          </Button>
        )}
        <Button
          disabled={update.isPending}
          onClick={() => {
            update.mutate({ isEstimate: !template.isEstimate }, done);
          }}
        >
          {template.isEstimate ? 'Confirmar o valor' : 'Marcar como estimativa'}
        </Button>
      </div>

      <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3">
        <Field
          label="Encerrar após o ciclo"
          placeholder="2026-12"
          value={endMonth}
          onChange={(event) => {
            setEndMonth(event.target.value);
          }}
          hint="Interrompe a geração futura. O histórico é mantido."
        />
        <Button
          disabled={update.isPending || endMonth.trim() === ''}
          onClick={() => {
            update.mutate({ endMonth: endMonth.trim() }, done);
          }}
        >
          Encerrar
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
      setError('Digite um valor como 1.234,56.');
      return;
    }
    if (scope === undefined) {
      setError(
        'Escolha se isso vale para um ciclo ou para todos os ciclos a partir de agora.',
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
        label="Novo valor"
        value={amount}
        onChange={(event) => {
          setAmount(event.target.value);
        }}
        onFocus={selectAll}
        hint={`A partir de ${currentMonth}`}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs font-medium text-zinc-600">
          O que isso muda?
        </legend>
        <Scope
          checked={scope === 'THIS_CYCLE_ONLY'}
          onSelect={() => {
            setScope('THIS_CYCLE_ONLY');
          }}
          title="Só neste ciclo"
          body="Só este ciclo muda. Todos os outros ciclos mantêm o valor que já têm."
        />
        <Scope
          checked={scope === 'THIS_AND_FUTURE'}
          onSelect={() => {
            setScope('THIS_AND_FUTURE');
          }}
          title="Neste ciclo e nos futuros"
          body="Este ciclo e todos os seguintes passam a usar o novo valor."
        />
      </fieldset>

      <p className="text-xs text-zinc-500">
        Os ciclos passados nunca são alterados, seja qual for a opção escolhida.
      </p>
      {error !== undefined && (
        <span role="alert" className="text-xs text-red-700">
          {error}
        </span>
      )}

      <Button variant="primary" type="submit" disabled={change.isPending}>
        Aplicar
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
