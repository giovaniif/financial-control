import type {
  BackupBucket,
  BackupBucketEvent,
  BackupCard,
  BackupDocument,
  BackupTemplate,
  ImportAnswers,
  ReconciliationRow,
} from '@fin/contracts';
import { BACKUP_VERSION } from '@fin/contracts';

import { CycleRef, PaydayAnchor } from '../../domain/budgeting/cycle-ref.js';
import type { HolidayCalendar } from '../../domain/ports/holiday-calendar.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import type {
  MonthReading,
  SpreadsheetReading,
} from './interpret-spreadsheet.js';

export class ImportAnswersIncomplete extends DomainError {}
export class DueDayOutsideCycle extends DomainError {}

export type { ImportAnswers, ReconciliationRow };

export interface Composition {
  document: BackupDocument;
  /** Where what was imported differs from the sheet's own arithmetic. */
  mismatches: ReconciliationRow[];
  notes: string[];
}

const SALARY = 'Salário';
const BASIS_POINTS = 100;

/**
 * UC-1.7 — the spreadsheet's half joined to the user's half, as a v1 backup
 * document.
 *
 * **Templates rather than materialised cycles.** The app already generates a
 * cycle from its templates, lazily and idempotently, so a bill that repeats is
 * imported as the one thing it is — a template with a value schedule for the
 * months its amount steps. Writing out 23 pre-computed cycles instead would
 * duplicate the engine, hand-chain every opening balance, and re-open the
 * whole class of due-dates-outside-their-cycle failures.
 */
export function composeBackup(
  reading: SpreadsheetReading,
  answers: ImportAnswers,
  exportedAt: string,
  holidays: HolidayCalendar,
): Composition {
  requireAnswers(reading, answers);

  const anchor = PaydayAnchor.of(
    answers.anchor.anchorDay,
    answers.anchor.shiftPolicy,
  );
  const months = reading.months.filter(
    (month) => month.month >= answers.fromMonth && !month.isBlank,
  );
  if (months.length === 0) {
    throw new ImportAnswersIncomplete(
      `No column holds anything from ${answers.fromMonth} onward.`,
    );
  }

  const accounts = answers.accounts.map((account, index) => ({
    id: `acc-${String(index + 1)}`,
    name: account.name,
    type: account.type,
    balance: account.balance,
  }));

  const cardLabels = new Set(answers.cards.map((card) => card.label));
  const templates = composeTemplates(months, answers, cardLabels);

  for (const template of templates) {
    assertDueDayFits(template, months, anchor, holidays);
  }

  return {
    document: {
      version: BACKUP_VERSION,
      exportedAt,
      anchor: answers.anchor,
      accounts,
      cycles: [],
      templates,
      cards: composeCards(answers, accounts),
      buckets: composeBuckets(reading, answers, exportedAt),
    },
    mismatches: reconcile(months),
    notes: notesFor(answers, reading),
  };
}

function requireAnswers(
  reading: SpreadsheetReading,
  answers: ImportAnswers,
): void {
  if (answers.accounts.length === 0) {
    throw new ImportAnswersIncomplete(
      'At least one account is needed: a card invoice is paid from one, and their total is the starting cash.',
    );
  }

  // Only the bills. The salary is dated by the payday anchor (UC-1.1), which
  // the user has already chosen, so asking for it again could only disagree.
  const cardLabels = new Set(answers.cards.map((card) => card.label));
  const missing = reading.outcomeLabels.filter(
    (label) => !cardLabels.has(label) && answers.dueDays[label] === undefined,
  );

  if (missing.length > 0) {
    throw new ImportAnswersIncomplete(
      `These need a due day before they can be imported: ${missing.join(', ')}.`,
    );
  }

  for (const bucket of answers.buckets) {
    // UC-6.1 — a goal without both is not a goal the domain will accept.
    if (
      bucket.mode === 'GOAL' &&
      (bucket.target === undefined || bucket.targetDate === undefined)
    ) {
      throw new ImportAnswersIncomplete(
        `${bucket.name} is a goal, so it needs a target and a target date.`,
      );
    }
  }

  const names = new Set(answers.accounts.map((account) => account.name));
  for (const card of answers.cards) {
    if (!names.has(card.paymentAccountName)) {
      throw new ImportAnswersIncomplete(
        `${card.label} is paid from an account called "${card.paymentAccountName}", which is not in the list.`,
      );
    }
  }
}

/**
 * One template per label. An amount that steps across months is UC-2.4's value
 * schedule, not several templates: a renovation climbing 2.600 → 2.924 is one
 * thing changing, and modelling it as four bills loses that.
 */
function composeTemplates(
  months: MonthReading[],
  answers: ImportAnswers,
  cardLabels: Set<string>,
): BackupTemplate[] {
  const series = new Map<string, Series>();

  const record = (label: string, month: string, amount: number) => {
    const existing = series.get(label);
    if (existing === undefined) {
      series.set(label, {
        first: { month, amount },
        last: { month, amount },
        steps: [],
      });
      return;
    }
    if (existing.last.amount !== amount) {
      existing.steps.push({ fromMonth: month, amount });
    }
    existing.last = { month, amount };
  };

  for (const month of months) {
    for (const { label, amount } of month.outcomes) {
      record(label, month.month, amount);
    }
    if (month.salary !== null) {
      record(SALARY, month.month, month.salary);
    }
  }

  const lastMonth = months[months.length - 1]?.month;

  return [...series].map(([label, run], index) => ({
    id: `tpl-${String(index + 1)}`,
    name: label,
    direction: label === SALARY ? ('IN' as const) : ('OUT' as const),
    dueDayOfMonth:
      label === SALARY
        ? answers.anchor.anchorDay
        : (answers.dueDays[label] ?? answers.anchor.anchorDay),
    amount: run.first.amount,
    startMonth: run.first.month,
    endMonth: run.last.month === lastMonth ? null : run.last.month,
    status: 'ACTIVE' as const,
    isEstimate: answers.estimates.includes(label) || cardLabels.has(label),
    valueSchedule: run.steps,
  }));
}

interface Series {
  first: { month: string; amount: number };
  last: { month: string; amount: number };
  steps: { fromMonth: string; amount: number }[];
}

/**
 * A due day that lands in a gap the cycle does not span generates nothing at
 * all, silently. Better to refuse the import and name the bill.
 */
function assertDueDayFits(
  template: BackupTemplate,
  months: MonthReading[],
  anchor: PaydayAnchor,
  holidays: HolidayCalendar,
): void {
  for (const month of months) {
    const ref = CycleRef.forMonth(month.month, anchor, holidays);
    // The same question the generator asks, asked the same way: a check that
    // is stricter than what generation does refuses imports that would have
    // worked.
    if (ref.dateForDayOfMonth(template.dueDayOfMonth) === undefined) {
      throw new DueDayOutsideCycle(
        `${template.name} falls due on day ${String(template.dueDayOfMonth)}, which the ${ref.label} cycle (${ref.range.toString()}) never reaches. Pick another day, or use the cycle's last day.`,
      );
    }
  }
}

/**
 * The cards themselves, so purchases can be registered from here on. Their
 * invoices are not reconstructed: the sheet records a monthly total, never the
 * purchases behind it, and inventing items would be fabricating history.
 */
function composeCards(
  answers: ImportAnswers,
  accounts: { id: string; name: string }[],
): BackupCard[] {
  const idByName = new Map(
    accounts.map((account) => [account.name, account.id]),
  );

  return answers.cards.flatMap((card, index) => {
    // requireAnswers has already refused a card paid from an unknown account.
    const paymentAccountId = idByName.get(card.paymentAccountName);

    return paymentAccountId === undefined
      ? []
      : [
          {
            id: `card-${String(index + 1)}`,
            name: card.label,
            limit: card.limit,
            closingDay: card.closingDay,
            dueDay: card.dueDay,
            paymentAccountId,
            invoices: [],
            plans: [],
          },
        ];
  });
}

function composeBuckets(
  reading: SpreadsheetReading,
  answers: ImportAnswers,
  exportedAt: string,
): BackupBucket[] {
  return answers.buckets.map((bucket, index) => {
    const read = reading.buckets.find(
      (candidate) => candidate.name === bucket.name,
    );
    const seed = bucket.seedBalance ?? read?.latestBalance ?? null;

    const events: BackupBucketEvent[] =
      seed === null || seed === 0
        ? []
        : [
            {
              kind: 'CORRECTION',
              id: `evt-${String(index + 1)}`,
              date: exportedAt.slice(0, 10),
              newBalance: seed,
              reason: 'Opening balance imported from the spreadsheet.',
            },
          ];

    return {
      id: `bkt-${String(index + 1)}`,
      name: bucket.name,
      purpose: '',
      mode: bucket.mode,
      status: 'ACTIVE' as const,
      priority: bucket.priority,
      target:
        bucket.mode === 'GOAL' &&
        bucket.target !== undefined &&
        bucket.targetDate !== undefined
          ? { amount: bucket.target, date: bucket.targetDate }
          : null,
      rule:
        read?.rule?.kind === 'PERCENT'
          ? {
              kind: 'PERCENT' as const,
              basisPoints: Math.round(read.rule.percent * BASIS_POINTS),
            }
          : {
              kind: 'FIXED' as const,
              amount: read?.rule?.kind === 'FIXED' ? read.rule.amount : 0,
            },
      expectedYieldBasisPoints: null,
      events,
    };
  });
}

/**
 * What was imported against the spreadsheet's own arithmetic. A figure that
 * quietly differs is worse than one that is missing, so every gap is reported
 * rather than smoothed over.
 */
function reconcile(months: MonthReading[]): ReconciliationRow[] {
  const rows: ReconciliationRow[] = [];

  for (const month of months) {
    const outcomes = month.outcomes.reduce(
      (total, outcome) => total + outcome.amount,
      0,
    );
    const variables = month.variables.reduce(
      (total, variable) => total + variable.amount,
      0,
    );
    const salary = month.salary ?? 0;

    const compare = (
      figure: ReconciliationRow['figure'],
      sheet: number | null,
      imported: number,
    ) => {
      if (sheet !== null && sheet !== imported) {
        rows.push({ month: month.month, figure, sheet, imported });
      }
    };

    compare('totalOutcome', month.derived.totalOutcome, outcomes);
    compare('surplus', month.derived.surplus, salary + outcomes);
    compare(
      'expectedSurplus',
      month.derived.expectedSurplus,
      salary + outcomes + variables,
    );
  }

  return rows;
}

function notesFor(
  answers: ImportAnswers,
  reading: SpreadsheetReading,
): string[] {
  const notes = [...reading.warnings];

  if (answers.cards.length > 0) {
    const names = answers.cards.map((card) => card.label).join(' and ');
    notes.push(
      `${names} came across as recurring estimates, not as card invoices: the sheet records a monthly total, never the purchases behind it. Register purchases from now on and retire those templates.`,
    );
  }

  const blank = reading.months.filter(
    (month) => month.isBlank && month.month >= answers.fromMonth,
  );
  if (blank.length > 0) {
    notes.push(
      `${blank.map((month) => month.month).join(', ')} ${blank.length === 1 ? 'is' : 'are'} blank in the sheet, so ${blank.length === 1 ? 'that cycle' : 'those cycles'} imported empty.`,
    );
  }

  notes.push(
    `Cycles before ${answers.fromMonth} were left out: the app holds a rolling twelve and does not reach back that far.`,
  );

  const seeded = answers.buckets.filter(
    (bucket) => (bucket.seedBalance ?? 0) !== 0,
  );
  if (seeded.length > 0) {
    notes.push(
      `${seeded.map((bucket) => bucket.name).join(', ')} opened at an observed balance recorded as a correction — the spreadsheet had typed over its own running total, so the history behind it is gone.`,
    );
  }

  return notes;
}
