import type { AccountType } from '@fin/contracts';

import { Button, Field } from '@/shared/ui';

import type { ImportDraftHandle } from '../../../model/use-import-draft.js';

const types: AccountType[] = ['CHECKING', 'SAVINGS', 'CASH'];

/**
 * UC-1.2 — collected rather than created. Applying the import runs a restore,
 * which replaces everything, so an account written now would be wiped by the
 * last step.
 */
export function ImportAccounts({ draft, update }: ImportDraftHandle) {
  const change = (index: number, field: 'name' | 'balance', value: string) => {
    update({
      accounts: draft.accounts.map((account, at) =>
        at === index ? { ...account, [field]: value } : account,
      ),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-zinc-600">
        The spreadsheet has no accounts in it, so this is the one thing you have
        to type from scratch. Their total is the cash every projection starts
        from.
      </p>

      {draft.accounts.map((account, index) => (
        <div
          key={index}
          className="grid grid-cols-[1fr_auto_1fr_auto] items-end gap-3"
        >
          <Field
            label="Name"
            value={account.name}
            onChange={(event) => {
              change(index, 'name', event.target.value);
            }}
          />
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
            Type
            <select
              value={account.type}
              onChange={(event) => {
                update({
                  accounts: draft.accounts.map((each, at) =>
                    at === index
                      ? { ...each, type: event.target.value as AccountType }
                      : each,
                  ),
                });
              }}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-normal"
            >
              {types.map((type) => (
                <option key={type} value={type}>
                  {type.toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Balance"
            value={account.balance}
            placeholder="2.160,00"
            onChange={(event) => {
              change(index, 'balance', event.target.value);
            }}
          />
          <Button
            aria-label={`Remove account ${String(index + 1)}`}
            onClick={() => {
              update({
                accounts: draft.accounts.filter((_, at) => at !== index),
              });
            }}
          >
            Remove
          </Button>
        </div>
      ))}

      <div>
        <Button
          variant="primary"
          onClick={() => {
            update({
              accounts: [
                ...draft.accounts,
                { name: '', type: 'CHECKING', balance: '' },
              ],
            });
          }}
        >
          Add account
        </Button>
      </div>
    </div>
  );
}
