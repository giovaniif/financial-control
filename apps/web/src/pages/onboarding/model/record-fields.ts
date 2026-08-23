import type {
  AccountType,
  AllocationRuleRequest,
  Cents,
  EstablishedRecordResponse,
  SetupRecordCorrectionRequest,
} from '@fin/contracts';

import { formatBRL, parseBRL } from '@/shared/lib';

/**
 * A record travels as the one sentence the user is shown, so the fields behind
 * it are read back out of that sentence to pre-fill the form. The patterns
 * mirror the summaries the setup draft writes, and a summary that stops
 * matching one is a record the app offers no inline edit on rather than a form
 * pre-filled with something that was never said.
 */
const ACCOUNT =
  /^(.+?) — a (checking|savings|cash) account holding R\$ (.+)\.$/;
const BILL = /^(.+?) — R\$ (.+?) on day (\d+)(, an estimate)?\.$/;
const CARD =
  /^(.+?) — limit R\$ (.+?), closing on day (\d+), due on day (\d+), paid from (.+)\.$/;
const BUCKET =
  /^(.+?) — (.+?) each cycle(?: toward R\$ (.+?) by (\d{4}-\d{2}-\d{2}))?, funded #\d+\.$/;
const PERCENT_RULE = /^(.+) % of Expected Surplus$/;
const FIXED_RULE = /^R\$ (.+)$/;

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
      kind: 'CARD';
      name: string;
      limit: Cents;
      closingDay: number;
      dueDay: number;
      paymentAccountName: string;
    }
  | {
      kind: 'BUCKET';
      name: string;
      rule: AllocationRuleRequest;
      target: { amount: Cents; date: string } | null;
    };

/** What a record is called, for the label on the buttons that act on it. */
export function recordName(summary: string): string {
  const [name] = summary.split(' — ');

  return name ?? summary;
}

/**
 * The fields behind a record, or `null` when there are none to edit — the
 * anchor and the salary hold a single value each and are answered again
 * rather than corrected.
 */
export function parseRecord(
  record: EstablishedRecordResponse,
): ParsedRecord | null {
  if (record.id === null) return null;

  switch (record.section) {
    case 'ACCOUNTS':
      return parseAccount(record.summary);
    case 'FIXED_BILLS':
    case 'VARIABLE_BILLS':
      return parseBill(record.summary);
    case 'CARDS':
      return parseCard(record.summary);
    case 'BUCKETS':
      return parseBucket(record.summary);
    case 'ANCHOR':
    case 'SALARY':
      return null;
    default: {
      const unreachable: never = record.section;
      return unreachable;
    }
  }
}

function parseAccount(summary: string): ParsedRecord | null {
  const match = ACCOUNT.exec(summary);
  if (match === null) return null;

  const [, name = '', type = '', balance = ''] = match;
  const cents = parseBRL(balance);

  return cents === null
    ? null
    : {
        kind: 'ACCOUNT',
        name,
        type: type.toUpperCase() as AccountType,
        balance: cents,
      };
}

function parseBill(summary: string): ParsedRecord | null {
  const match = BILL.exec(summary);
  if (match === null) return null;

  const [, name = '', amount = '', day = '', estimate] = match;
  const cents = parseBRL(amount);

  return cents === null
    ? null
    : {
        kind: 'BILL',
        name,
        amount: cents,
        dueDayOfMonth: Number(day),
        isEstimate: estimate !== undefined,
      };
}

function parseCard(summary: string): ParsedRecord | null {
  const match = CARD.exec(summary);
  if (match === null) return null;

  const [, name = '', limit = '', closing = '', due = '', account = ''] = match;
  const cents = parseBRL(limit);

  return cents === null
    ? null
    : {
        kind: 'CARD',
        name,
        limit: cents,
        closingDay: Number(closing),
        dueDay: Number(due),
        paymentAccountName: account,
      };
}

function parseBucket(summary: string): ParsedRecord | null {
  const match = BUCKET.exec(summary);
  if (match === null) return null;

  const [, name = '', rule = '', target, date] = match;
  const allocation = parseRule(rule);
  if (allocation === null) return null;

  if (target === undefined || date === undefined) {
    return { kind: 'BUCKET', name, rule: allocation, target: null };
  }

  const amount = parseBRL(target);

  return amount === null
    ? null
    : { kind: 'BUCKET', name, rule: allocation, target: { amount, date } };
}

function parseRule(rule: string): AllocationRuleRequest | null {
  const share = PERCENT_RULE.exec(rule);
  if (share !== null) {
    const percent = readPercent(share[1] ?? '');

    return percent === null ? null : { kind: 'PERCENT', percent };
  }

  const fixed = FIXED_RULE.exec(rule);
  if (fixed === null) return null;

  const amount = parseBRL(fixed[1] ?? '');

  return amount === null ? null : { kind: 'FIXED', amount };
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
    case 'CARD':
      return {
        ...EMPTY,
        name: parsed.name,
        limit: formatBRL(parsed.limit),
        closingDay: String(parsed.closingDay),
        dueDay: String(parsed.dueDay),
        paymentAccountName: parsed.paymentAccountName,
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

const NAME_REQUIRED = 'A name is required.';
const NOT_MONEY = 'Write an amount the way the app does — 1.234,56.';
const NOT_A_DAY = 'A day of the month is a whole number.';
const NOT_A_SHARE = 'Write a share as a number — 20, or 33,33.';

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
    case 'CARD': {
      const limit = money('limit', parsed.limit);
      if (limit !== undefined) request.limit = limit;
      const closing = day('closingDay', parsed.closingDay);
      if (closing !== undefined) request.closingDay = closing;
      const due = day('dueDay', parsed.dueDay);
      if (due !== undefined) request.dueDay = due;
      const account = form.paymentAccountName.trim();
      if (account !== '' && account !== parsed.paymentAccountName) {
        request.paymentAccountName = account;
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
