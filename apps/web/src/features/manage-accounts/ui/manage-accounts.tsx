import type { AccountResponse, AccountType } from '@fin/contracts';
import { useState } from 'react';

import { formatBRL, parseBRL } from '@/shared/lib';
import { Button, Dialog, Field } from '@/shared/ui';

import {
  useOpenAccount,
  useUpdateAccount,
} from '../api/use-manage-accounts.js';

const types = {
  Checking: 'CHECKING',
  Savings: 'SAVINGS',
  Cash: 'CASH',
} as const;

type TypeLabel = keyof typeof types;

/** UC-1.2 — checking, savings and cash, and their total is the starting cash. */
export function ManageAccounts({ accounts }: { accounts: AccountResponse[] }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AccountResponse>();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {accounts.map((account) => (
        <Button
          key={account.id}
          aria-label={`Edit ${account.name}`}
          onClick={() => {
            setEditing(account);
          }}
        >
          {account.name}
        </Button>
      ))}
      <Button
        variant="primary"
        onClick={() => {
          setAdding(true);
        }}
      >
        Add account
      </Button>

      <Dialog
        open={adding}
        title="Add an account"
        onClose={() => {
          setAdding(false);
        }}
      >
        <AddForm
          onDone={() => {
            setAdding(false);
          }}
        />
      </Dialog>

      <Dialog
        open={editing !== undefined}
        title={editing?.name ?? ''}
        onClose={() => {
          setEditing(undefined);
        }}
      >
        {editing !== undefined && (
          <EditForm
            account={editing}
            onDone={() => {
              setEditing(undefined);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function AddForm({ onDone }: { onDone: () => void }) {
  const openAccount = useOpenAccount();
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('CHECKING');
  const [balance, setBalance] = useState('');
  const [error, setError] = useState<string>();

  const submit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    const cents = parseBRL(balance);

    if (cents === null) {
      setError('Enter an amount like 1.234,56.');
      return;
    }

    openAccount.mutate(
      { name: name.trim(), type, balance: cents },
      { onSuccess: onDone },
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field
        label="Name"
        value={name}
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
        Type
        <select
          value={labelOf(type)}
          onChange={(event) => {
            setType(types[event.target.value as TypeLabel]);
          }}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-normal"
        >
          {Object.keys(types).map((label) => (
            <option key={label}>{label}</option>
          ))}
        </select>
      </label>
      <Field
        label="Balance"
        value={balance}
        placeholder="1.234,56"
        onChange={(event) => {
          setBalance(event.target.value);
        }}
        {...(error === undefined ? {} : { error })}
      />
      <Button
        variant="primary"
        type="submit"
        disabled={openAccount.isPending || name.trim() === ''}
      >
        Add
      </Button>
    </form>
  );
}

function EditForm({
  account,
  onDone,
}: {
  account: AccountResponse;
  onDone: () => void;
}) {
  const { rename, correct, remove } = useUpdateAccount(account.id);
  const [name, setName] = useState(account.name);
  const [balance, setBalance] = useState(digitsOf(account.balance));
  const [error, setError] = useState<string>();
  const done = { onSuccess: onDone };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Field
          label="Name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        <Button
          disabled={rename.isPending || name.trim() === ''}
          onClick={() => {
            rename.mutate(name.trim(), done);
          }}
        >
          Rename
        </Button>
      </div>

      <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3">
        {/* Balances drift; correcting one is expected, not exceptional. */}
        <Field
          label="Balance"
          value={balance}
          onChange={(event) => {
            setBalance(event.target.value);
          }}
          {...(error === undefined ? {} : { error })}
        />
        <Button
          disabled={correct.isPending}
          onClick={() => {
            const cents = parseBRL(balance);

            if (cents === null) {
              setError('Enter an amount like 1.234,56.');
              return;
            }
            correct.mutate(cents, done);
          }}
        >
          Correct the balance
        </Button>
      </div>

      <div className="border-t border-zinc-100 pt-3">
        <Button
          variant="danger"
          disabled={remove.isPending}
          onClick={() => {
            remove.mutate(undefined, done);
          }}
        >
          Remove
        </Button>
      </div>
    </div>
  );
}

function labelOf(type: AccountType): TypeLabel {
  return (
    (Object.keys(types) as TypeLabel[]).find(
      (label) => types[label] === type,
    ) ?? 'Checking'
  );
}

function digitsOf(cents: number): string {
  return formatBRL(cents).replace(/[^\d,-]/g, '');
}
