import type { Cents } from './money.js';

export type EntryKind =
  'INCOME' | 'FIXED' | 'INVOICE' | 'VARIABLE' | 'ALLOCATION';

export type SettlementStatus =
  'PENDING' | 'PAID' | 'RECEIVED' | 'SKIPPED' | 'OVERDUE';

/** Whether unconfirmed placeholders are counted. The global header toggle. */
export type EstimateMode = 'included' | 'excluded';

/**
 * The calculation chain, in the order the UI must always present it:
 * Total Outcome, Surplus, Expected Surplus, Allocations, Net Surplus, Closing.
 */
export interface CalculationChainResponse {
  openingBalance: Cents;
  totalIncome: Cents;
  totalOutcome: Cents;
  variables: Cents;
  surplus: Cents;
  expectedSurplus: Cents;
  allocations: Cents;
  netSurplus: Cents;
  closingBalance: Cents;
}

export interface LedgerEntryResponse {
  id: string;
  description: string;
  kind: EntryKind;
  /** `YYYY-MM-DD`. What assigns the entry to its cycle. */
  dueDate: string;
  planned: Cents;
  actual: Cents | null;
  status: SettlementStatus;
  isEstimate: boolean;
  isOverridden: boolean;
  /** Undefined until settled — there is nothing to compare a plan against yet. */
  variance: Cents | null;
  /** The balance standing after this entry. */
  balance: Cents;
}

/** The lowest the balance gets, and what took it there. */
export interface LowWaterMarkResponse {
  balance: Cents;
  date: string;
  description: string;
}

export interface CycleResponse {
  id: string;
  /** `YYYY-MM`, the month the cycle is named for. */
  month: string;
  /** "August 2026" — never a bare month name without its bounds. */
  label: string;
  start: string;
  end: string;
  status: 'OPEN' | 'CLOSED';
  estimates: EstimateMode;
  chain: CalculationChainResponse;
  entries: LedgerEntryResponse[];
  lowWaterMark: LowWaterMarkResponse | null;
  /** The first date the balance crosses zero, if it ever does. */
  firstNegativeDate: string | null;
}

export type CyclePosition = 'current' | 'next' | 'projected';

/** One cycle in the header's rolling window. */
export interface CycleSummaryResponse {
  month: string;
  label: string;
  start: string;
  end: string;
  status: 'OPEN' | 'CLOSED';
  position: CyclePosition;
  openingBalance: Cents;
  closingBalance: Cents;
  netSurplus: Cents;
  /** False for a month nobody has touched: projected, not persisted. */
  isMaterialised: boolean;
}

export interface CycleWindowResponse {
  estimates: EstimateMode;
  cycles: CycleSummaryResponse[];
}
