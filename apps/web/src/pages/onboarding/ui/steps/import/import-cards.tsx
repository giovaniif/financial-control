import type { SpreadsheetReading } from '@fin/contracts';

import { Field } from '@/shared/ui';

import {
  blankCard,
  type ImportDraftHandle,
} from '../../../model/use-import-draft.js';

interface Props extends ImportDraftHandle {
  reading: SpreadsheetReading;
}

/**
 * UC-1.3 / UC-5.4 — which of the outcome rows are cards.
 *
 * The sheet cannot say: `Nubank` and `Inter` are rows of monthly totals like
 * any other bill, so the user is the only one who knows.
 */
export function ImportCards({ reading, draft, toggleCard, setCard }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-zinc-600">
        A card invoice lands in the cycle containing its{' '}
        <strong className="font-medium text-zinc-900">due date</strong>, not the
        one its purchases were made in — a day either side of the closing day is
        a whole cycle apart in cash. Tick the rows that are credit cards.
      </p>

      <ul className="flex flex-col gap-3">
        {reading.outcomeLabels.map((label) => {
          const ticked = draft.cardLabels.includes(label);
          const card = draft.cards[label] ?? blankCard();

          return (
            <li key={label} className="rounded-xl border border-zinc-200 p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={ticked}
                  onChange={() => {
                    toggleCard(label);
                  }}
                />
                {label}
              </label>

              {ticked && (
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Field
                    label="Closing day"
                    type="number"
                    value={card.closingDay}
                    onChange={(event) => {
                      setCard(label, { closingDay: event.target.value });
                    }}
                  />
                  <Field
                    label="Due day"
                    type="number"
                    value={card.dueDay}
                    onChange={(event) => {
                      setCard(label, { dueDay: event.target.value });
                    }}
                  />
                  <Field
                    label="Limit"
                    value={card.limit}
                    placeholder="10.000,00"
                    onChange={(event) => {
                      setCard(label, { limit: event.target.value });
                    }}
                  />
                  <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
                    Paid from
                    <select
                      value={card.paymentAccountName}
                      onChange={(event) => {
                        setCard(label, {
                          paymentAccountName: event.target.value,
                        });
                      }}
                      className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-normal"
                    >
                      {draft.accounts.map((account) => (
                        <option key={account.name} value={account.name}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* The sheet holds a monthly total, never the purchases behind it. */}
      <p className="text-xs text-zinc-500">
        A card row comes across as a recurring estimate rather than a real
        invoice — the sheet records only what the invoice came to. Register
        purchases from here on and the estimate can be retired.
      </p>
    </div>
  );
}
