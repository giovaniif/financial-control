import type { AccountType } from './accounts.js';
import type { BucketMode } from './buckets.js';
import type { Cents } from './money.js';
import type { ShiftPolicy } from './settings.js';

/**
 * UC-1.7 — importing the "Controle Financeiro" spreadsheet.
 *
 * The reading is the sheet's half and the answers are the user's; neither is
 * persisted on its own. The reading round-trips through the client between the
 * two calls, which is what keeps the import stateless — there is no
 * half-finished import to clean up.
 */
export interface NamedAmount {
  label: string;
  amount: Cents;
}

/** The spreadsheet's own arithmetic, kept so the import can be reconciled. */
export interface DerivedFigures {
  totalOutcome: Cents | null;
  surplus: Cents | null;
  expectedSurplus: Cents | null;
  netSurplus: Cents | null;
}

export interface MonthReading {
  /** `YYYY-MM`, the cycle this column maps onto. */
  month: string;
  monthName: string;
  /** No amount anywhere in the column — emptier than it looks. */
  isBlank: boolean;
  salary: Cents | null;
  outcomes: NamedAmount[];
  variables: NamedAmount[];
  allocations: NamedAmount[];
  balances: NamedAmount[];
  derived: DerivedFigures;
}

export type ReadRule =
  { kind: 'PERCENT'; percent: number } | { kind: 'FIXED'; amount: Cents };

export interface BucketReading {
  name: string;
  /** Recovered from the cell formula; null when the sheet stated none. */
  rule: ReadRule | null;
  latestBalance: Cents | null;
  /** The balance was typed over rather than accumulated — see UC-6.7. */
  balanceWasOverwritten: boolean;
}

export interface SpreadsheetReading {
  months: MonthReading[];
  /** The column standing for today; everything before it is history. */
  currentMonth: string;
  /** Bills still running in `currentMonth` or later. Retired rows are left out. */
  outcomeLabels: string[];
  /** Buckets still funded in `currentMonth` or later. */
  buckets: BucketReading[];
  /** The year mapping is inferred, so it travels with its reasoning. */
  inference: { firstColumnYear: number; reasoning: string };
  missing: string[];
  warnings: string[];
}

export interface ImportAnswers {
  anchor: { anchorDay: number; shiftPolicy: ShiftPolicy };
  accounts: { name: string; type: AccountType; balance: Cents }[];
  /** Outcome labels the user identified as credit cards. */
  cards: {
    label: string;
    closingDay: number;
    dueDay: number;
    limit: Cents;
    paymentAccountName: string;
  }[];
  /** Day of the month each label falls due, keyed by label. */
  dueDays: Record<string, number>;
  estimates: string[];
  buckets: {
    name: string;
    mode: BucketMode;
    target?: Cents;
    targetDate?: string;
    priority: number;
    seedBalance?: Cents;
  }[];
  /** The first cycle to import; anything earlier is outside the window. */
  fromMonth: string;
}

export interface ReconciliationRow {
  month: string;
  figure: 'totalOutcome' | 'surplus' | 'expectedSurplus';
  sheet: Cents;
  imported: Cents;
}

export interface ImportReportResponse {
  imported: {
    templates: number;
    accounts: number;
    cards: number;
    buckets: number;
    months: number;
  };
  /** Where the import differs from the spreadsheet's own arithmetic. */
  mismatches: ReconciliationRow[];
  notes: string[];
}

export interface ApplyImportRequest {
  reading: SpreadsheetReading;
  answers: ImportAnswers;
}
