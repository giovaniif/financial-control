import type { AccountResponse, OpenCardRequest } from '@fin/contracts';
import { useState } from 'react';

import { parseBRL } from '@/shared/lib';
import { Button, Dialog, Field } from '@/shared/ui';

import { useOpenCard } from '../api/use-configure-card.js';

/** UC-1.3 — a card is a name, a limit, a day pair, and who pays it. */
export function AddCardButton({ accounts }: { accounts: AccountResponse[] }) {
  const [open, setOpen] = useState(false);

  // An invoice is settled from an account, so there is nothing to configure
  // until one exists.
  if (accounts.length === 0) {
    return (
      <p className="text-xs text-zinc-500">
        Adicione uma conta primeiro — uma fatura é paga a partir de uma conta.
      </p>
    );
  }

  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        Adicionar cartão
      </Button>
      <Dialog
        open={open}
        title="Adicionar cartão"
        onClose={() => {
          setOpen(false);
        }}
      >
        <Form
          accounts={accounts}
          onDone={() => {
            setOpen(false);
          }}
        />
      </Dialog>
    </>
  );
}

function Form({
  accounts,
  onDone,
}: {
  accounts: AccountResponse[];
  onDone: () => void;
}) {
  const openCard = useOpenCard();
  const [name, setName] = useState('');
  const [limit, setLimit] = useState('');
  const [closingDay, setClosingDay] = useState('28');
  const [dueDay, setDueDay] = useState('10');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const closing = Number(closingDay);
  const due = Number(dueDay);

  const submit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    const cents = parseBRL(limit);
    const found: Record<string, string> = {};

    if (name.trim() === '') {
      found['name'] = 'Dê um nome ao cartão.';
    }
    if (cents === null) {
      found['limit'] = 'Digite um valor como 1.234,56.';
    }
    if (!isDay(closing)) {
      found['closingDay'] = 'Um dia entre 1 e 31.';
    }
    if (!isDay(due)) {
      found['dueDay'] = 'Um dia entre 1 e 31.';
    }

    setErrors(found);
    if (Object.keys(found).length > 0 || cents === null) {
      return;
    }

    const card: OpenCardRequest = {
      name: name.trim(),
      limit: Math.abs(cents),
      closingDay: closing,
      dueDay: due,
      paymentAccountId: accountId,
    };

    openCard.mutate(card, { onSuccess: onDone });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field
        label="Nome"
        value={name}
        onChange={(event) => {
          setName(event.target.value);
        }}
        {...(errors['name'] === undefined ? {} : { error: errors['name'] })}
      />
      <Field
        label="Limite"
        value={limit}
        placeholder="10.000,00"
        onChange={(event) => {
          setLimit(event.target.value);
        }}
        {...(errors['limit'] === undefined ? {} : { error: errors['limit'] })}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Dia de fechamento"
          type="number"
          value={closingDay}
          onChange={(event) => {
            setClosingDay(event.target.value);
          }}
          {...(errors['closingDay'] === undefined
            ? {}
            : { error: errors['closingDay'] })}
        />
        <Field
          label="Dia de vencimento"
          type="number"
          value={dueDay}
          onChange={(event) => {
            setDueDay(event.target.value);
          }}
          {...(errors['dueDay'] === undefined
            ? {}
            : { error: errors['dueDay'] })}
        />
      </div>

      {/* The day pair drives which cycle every purchase is paid from, so it
          is spelled out before the card exists. */}
      {isDay(closing) && isDay(due) && (
        <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          As compras feitas até o dia {closing} entram na fatura com vencimento
          no dia {due} do mês seguinte. Uma compra feita um dia depois espera a
          fatura seguinte — um ciclo inteiro depois, em termos de caixa.
        </p>
      )}

      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
        Conta de pagamento
        <select
          value={accountId}
          onChange={(event) => {
            setAccountId(event.target.value);
          }}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-normal"
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </label>

      <Button variant="primary" type="submit" disabled={openCard.isPending}>
        Adicionar
      </Button>
    </form>
  );
}

function isDay(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 31;
}
