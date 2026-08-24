import type {
  AccountType,
  AllocationRuleRequest,
  Cents,
  EstablishedBucketFields,
  EstablishedRecordResponse,
  SetupRecordCorrectionRequest,
} from '@fin/contracts';

import { formatBRL, parseBRL } from '@/shared/lib';

export type ParsedRecord =
  | { kind: 'ACCOUNT'; name: string; type: AccountType; balance: Cents }
  | {
      kind: 'BILL';
      name: string;
      amount: Cents;
      dueDayOfMonth: number;
      isEstimate: boolean;
    }
  | {
      kind: 'BUCKET';
      name: string;
      rule: AllocationRuleRequest;
      target: { amount: Cents; date: string } | null;
    };

/** What a record is called, for the label on the buttons that act on it. */
export function recordName(record: EstablishedRecordResponse): string {
  return record.fields === null ? record.summary : record.fields.name;
}

/**
 * The fields behind a record, or `null` when there are none to edit — the
 * anchor and the salary hold a single value each and are answered again
 * rather than corrected.
 *
 * The record arrives as fields as well as prose (FIN-124), so this reads what
 * the turn stated. A summary is written for a person and may be reworded
 * without anything here noticing.
 */
export function parseRecord(
  record: EstablishedRecordResponse,
): ParsedRecord | null {
  if (record.id === null) return null;

  switch (record.section) {
    case 'ACCOUNTS':
      return { kind: 'ACCOUNT', ...record.fields };
    case 'FIXED_BILLS':
    case 'VARIABLE_BILLS':
      return {
        kind: 'BILL',
        ...record.fields,
        // Outgoing money is negative in the domain; the editor asks what the
        // bill costs, and the draft normalises the sign on the way back.
        amount: Math.abs(record.fields.amount),
      };
    case 'BUCKETS':
      return bucketOf(record.fields);
    case 'ANCHOR':
    case 'SALARY':
      return null;
    default: {
      const unreachable: never = record;
      return unreachable;
    }
  }
}

function bucketOf(bucket: EstablishedBucketFields): ParsedRecord {
  const { name, rule } = bucket;

  return bucket.mode === 'GOAL'
    ? {
        kind: 'BUCKET',
        name,
        rule,
        target: { amount: bucket.target, date: bucket.targetDate },
      }
    : { kind: 'BUCKET', name, rule, target: null };
}

/** Every field the editor can hold, as typed. */
export interface EditorForm {
  name: string;
  type: AccountType;
  balance: string;
  amount: string;
  dueDayOfMonth: string;
  isEstimate: boolean;
  limit: string;
  closingDay: string;
  dueDay: string;
  paymentAccountName: string;
  ruleKind: AllocationRuleRequest['kind'];
  percent: string;
  ruleAmount: string;
  target: string;
  targetDate: string;
}

export type FieldErrors = Partial<Record<keyof EditorForm, string>>;

const EMPTY: EditorForm = {
  name: '',
  type: 'CHECKING',
  balance: '',
  amount: '',
  dueDayOfMonth: '',
  isEstimate: false,
  limit: '',
  closingDay: '',
  dueDay: '',
  paymentAccountName: '',
  ruleKind: 'PERCENT',
  percent: '',
  ruleAmount: '',
  target: '',
  targetDate: '',
};

/** The form as the record already reads, so an edit starts from the fact. */
export function formOf(parsed: ParsedRecord): EditorForm {
  switch (parsed.kind) {
    case 'ACCOUNT':
      return {
        ...EMPTY,
        name: parsed.name,
        type: parsed.type,
        balance: formatBRL(parsed.balance),
      };
    case 'BILL':
      return {
        ...EMPTY,
        name: parsed.name,
        amount: formatBRL(parsed.amount),
        dueDayOfMonth: String(parsed.dueDayOfMonth),
        isEstimate: parsed.isEstimate,
      };
    case 'BUCKET':
      return {
        ...EMPTY,
        name: parsed.name,
        ruleKind: parsed.rule.kind,
        percent:
          parsed.rule.kind === 'PERCENT' ? String(parsed.rule.percent) : '',
        ruleAmount:
          parsed.rule.kind === 'FIXED' ? formatBRL(parsed.rule.amount) : '',
        target: parsed.target === null ? '' : formatBRL(parsed.target.amount),
        targetDate: parsed.target?.date ?? '',
      };
    default: {
      const unreachable: never = parsed;
      return unreachable;
    }
  }
}

const NAME_REQUIRED = 'Um nome é obrigatório.';
const NOT_MONEY = 'Escreva um valor do jeito que o app usa — 1.234,56.';
const NOT_A_DAY = 'Um dia do mês é um número inteiro.';
const NOT_A_SHARE = 'Escreva um percentual como número — 20, ou 33,33.';

export interface Correction {
  request: SetupRecordCorrectionRequest;
  errors: FieldErrors;
}

/**
 * Only what actually changed. Anything left out keeps whatever the record
 * already holds, so a form saved untouched asks for nothing — and a figure the
 * app cannot read is refused here rather than sent as a silent zero.
 */
export function correctionOf(
  parsed: ParsedRecord,
  form: EditorForm,
): Correction {
  const request: SetupRecordCorrectionRequest = {};
  const errors: FieldErrors = {};

  const named = form.name.trim();
  if (named === '') {
    errors.name = NAME_REQUIRED;
  } else if (named !== parsed.name) {
    request.name = named;
  }

  const money = (field: keyof EditorForm, was: Cents): Cents | undefined => {
    const cents = parseBRL(String(form[field]));
    if (cents === null) {
      errors[field] = NOT_MONEY;
      return undefined;
    }
    return cents === was ? undefined : cents;
  };

  const day = (field: keyof EditorForm, was: number): number | undefined => {
    const value = String(form[field]).trim();
    if (!/^\d+$/.test(value)) {
      errors[field] = NOT_A_DAY;
      return undefined;
    }
    return Number(value) === was ? undefined : Number(value);
  };

  switch (parsed.kind) {
    case 'ACCOUNT': {
      if (form.type !== parsed.type) request.type = form.type;
      const balance = money('balance', parsed.balance);
      if (balance !== undefined) request.balance = balance;
      break;
    }
    case 'BILL': {
      const amount = money('amount', parsed.amount);
      if (amount !== undefined) request.amount = amount;
      const due = day('dueDayOfMonth', parsed.dueDayOfMonth);
      if (due !== undefined) request.dueDayOfMonth = due;
      if (form.isEstimate !== parsed.isEstimate) {
        request.isEstimate = form.isEstimate;
      }
      break;
    }
    case 'BUCKET': {
      const rule = ruleOf(form, errors);
      if (rule !== undefined && !sameRule(rule, parsed.rule)) {
        request.rule = rule;
      }
      if (parsed.target !== null) {
        const target = money('target', parsed.target.amount);
        if (target !== undefined) request.target = target;
        if (form.targetDate !== parsed.target.date && form.targetDate !== '') {
          request.targetDate = form.targetDate;
        }
      }
      break;
    }
    default: {
      const unreachable: never = parsed;
      return unreachable;
    }
  }

  return { request, errors };
}

function ruleOf(
  form: EditorForm,
  errors: FieldErrors,
): AllocationRuleRequest | undefined {
  if (form.ruleKind === 'FIXED') {
    const amount = parseBRL(form.ruleAmount);
    if (amount === null) {
      errors.ruleAmount = NOT_MONEY;
      return undefined;
    }
    return { kind: 'FIXED', amount };
  }

  const percent = readPercent(form.percent);
  if (percent === null) {
    errors.percent = NOT_A_SHARE;
    return undefined;
  }

  return { kind: 'PERCENT', percent };
}

function sameRule(
  rule: AllocationRuleRequest,
  was: AllocationRuleRequest,
): boolean {
  if (rule.kind !== was.kind) return false;

  return rule.kind === 'PERCENT'
    ? was.kind === 'PERCENT' && rule.percent === was.percent
    : was.kind === 'FIXED' && rule.amount === was.amount;
}

function readPercent(value: string): number | null {
  const cleaned = value.trim().replace('%', '').replace(',', '.').trim();
  const percent = Number(cleaned);

  return cleaned !== '' && Number.isFinite(percent) && percent >= 0
    ? percent
    : null;
}
