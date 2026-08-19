import type { AccountType, SetupRecordCorrectionRequest } from '@fin/contracts';
import { useId, useState, type SyntheticEvent } from 'react';

import { Button, Field } from '@/shared/ui';

import {
  correctionOf,
  formOf,
  type EditorForm,
  type FieldErrors,
  type ParsedRecord,
} from '../model/record-fields.js';

interface Props {
  parsed: ParsedRecord;
  pending: boolean;
  onSave: (correction: SetupRecordCorrectionRequest) => void;
  onCancel: () => void;
}

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'CHECKING', label: 'Checking' },
  { value: 'SAVINGS', label: 'Savings' },
  { value: 'CASH', label: 'Cash' },
];

/**
 * The record's own fields, pre-filled with what was understood. Saving states
 * only what changed: everything left alone keeps whatever the draft holds, so
 * an edit can never quietly rewrite a field nobody touched.
 */
export function RecordEditor({ parsed, pending, onSave, onCancel }: Props) {
  const [form, setForm] = useState<EditorForm>(() => formOf(parsed));
  const [errors, setErrors] = useState<FieldErrors>({});

  const set = <K extends keyof EditorForm>(field: K, value: EditorForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const { request, errors: refused } = correctionOf(parsed, form);
    setErrors(refused);

    if (Object.keys(refused).length > 0) return;
    // Nothing changed is not a correction, and the draft would refuse it.
    if (Object.keys(request).length === 0) {
      onCancel();
      return;
    }

    onSave(request);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 pt-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Name"
          value={form.name}
          {...(errors.name === undefined ? {} : { error: errors.name })}
          onChange={(event) => {
            set('name', event.target.value);
          }}
        />

        {parsed.kind === 'ACCOUNT' && (
          <>
            <Choice
              label="Kind"
              value={form.type}
              options={ACCOUNT_TYPES}
              onChange={(value) => {
                set('type', value);
              }}
            />
            <Money
              label="Balance"
              value={form.balance}
              error={errors.balance}
              onChange={(value) => {
                set('balance', value);
              }}
            />
          </>
        )}

        {parsed.kind === 'BILL' && (
          <>
            <Money
              label="Amount"
              value={form.amount}
              error={errors.amount}
              onChange={(value) => {
                set('amount', value);
              }}
            />
            <Day
              label="Due day of month"
              value={form.dueDayOfMonth}
              error={errors.dueDayOfMonth}
              onChange={(value) => {
                set('dueDayOfMonth', value);
              }}
            />
          </>
        )}

        {parsed.kind === 'CARD' && (
          <>
            <Money
              label="Limit"
              value={form.limit}
              error={errors.limit}
              onChange={(value) => {
                set('limit', value);
              }}
            />
            <Day
              label="Closing day"
              value={form.closingDay}
              error={errors.closingDay}
              onChange={(value) => {
                set('closingDay', value);
              }}
            />
            <Day
              label="Due day"
              value={form.dueDay}
              error={errors.dueDay}
              onChange={(value) => {
                set('dueDay', value);
              }}
            />
            <Field
              label="Paid from"
              value={form.paymentAccountName}
              onChange={(event) => {
                set('paymentAccountName', event.target.value);
              }}
            />
          </>
        )}

        {parsed.kind === 'BUCKET' && (
          <>
            <Choice
              label="Each cycle"
              value={form.ruleKind}
              options={[
                { value: 'PERCENT', label: 'A share of Expected Surplus' },
                { value: 'FIXED', label: 'A fixed amount' },
              ]}
              onChange={(value) => {
                set('ruleKind', value);
              }}
            />
            {form.ruleKind === 'PERCENT' ? (
              <Field
                label="Share of Expected Surplus (%)"
                type="number"
                step="0.01"
                min="0"
                value={form.percent}
                {...(errors.percent === undefined
                  ? {}
                  : { error: errors.percent })}
                onChange={(event) => {
                  set('percent', event.target.value);
                }}
              />
            ) : (
              <Money
                label="Amount each cycle"
                value={form.ruleAmount}
                error={errors.ruleAmount}
                onChange={(value) => {
                  set('ruleAmount', value);
                }}
              />
            )}
            {parsed.target !== null && (
              <>
                <Money
                  label="Target"
                  value={form.target}
                  error={errors.target}
                  onChange={(value) => {
                    set('target', value);
                  }}
                />
                <Field
                  label="Target date"
                  type="date"
                  value={form.targetDate}
                  onChange={(event) => {
                    set('targetDate', event.target.value);
                  }}
                />
              </>
            )}
          </>
        )}
      </div>

      {parsed.kind === 'BILL' && (
        <label className="flex items-center gap-2 text-xs text-zinc-600">
          <input
            type="checkbox"
            checked={form.isEstimate}
            onChange={(event) => {
              set('isEstimate', event.target.checked);
            }}
          />
          An estimate, not a confirmed figure
        </label>
      )}

      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          Save
        </Button>
        <Button type="button" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Money({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: string;
  error: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <Field
      label={label}
      inputMode="decimal"
      value={value}
      {...(error === undefined ? {} : { error })}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  );
}

function Day({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: string;
  error: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <Field
      label={label}
      type="number"
      min="1"
      max="31"
      value={value}
      {...(error === undefined ? {} : { error })}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const id = useId();

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-zinc-600">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => {
          onChange(event.target.value as T);
        }}
        className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:border-zinc-400 focus:outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
