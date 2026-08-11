import type { Cents } from './money.js';

export type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

/** The one-sentence answer, and the three numbers that qualify it. */
export interface HeadlineResponse {
  cycleMonth: string;
  cycleLabel: string;
  range: string;
  incoming: Cents;
  outgoing: Cents;
  free: Cents;
  lowestPoint: Cents | null;
  lowestPointDate: string | null;
  closing: Cents;
  /** The same closing balance without the unconfirmed placeholders. */
  closingWithoutEstimates: Cents;
}

export interface KpiResponse {
  label: string;
  amount: Cents;
  note: string;
}

export interface CycleProgressResponse {
  dayOfCycle: number;
  cycleLength: number;
  timePercent: number;
  spent: Cents;
  plannedOut: Cents;
  spentPercent: number;
}

export interface UpcomingEntryResponse {
  id: string;
  cycleMonth: string;
  description: string;
  dueDate: string;
  amount: Cents;
  isEstimate: boolean;
  isOverdue: boolean;
  daysLate: number;
}

export interface AlertResponse {
  severity: AlertSeverity;
  title: string;
  body: string;
}

export interface DashboardResponse {
  today: string;
  currentCycleMonth: string;
  headline: HeadlineResponse;
  kpis: KpiResponse[];
  progress: CycleProgressResponse;
  upcoming: UpcomingEntryResponse[];
  alerts: AlertResponse[];
}

export interface HorizonResponse {
  years: number;
  total: Cents;
  byBucket: { bucketId: string; name: string; amount: Cents }[];
}

export interface BucketProjectionResponse {
  bucketId: string;
  name: string;
  isGoal: boolean;
  contributionPerCycle: Cents;
  /** An assumption, and labelled as one wherever it influences a number. */
  expectedYieldPercent: number;
  reachesTargetIn: number | null;
  target: Cents | null;
  targetDate: string | null;
  isOnTrack: boolean | null;
  contributionToCatchUp: Cents | null;
  inFiveYears: Cents | null;
  inTenYears: Cents | null;
}

export interface RetirementResponse {
  bucketId: string;
  name: string;
  balanceAtHorizon: Cents;
  /** Retirement measured in monthly income, not in a lump sum. */
  sustainableMonthlyIncome: Cents;
}

export interface WealthProjectionResponse {
  horizons: HorizonResponse[];
  buckets: BucketProjectionResponse[];
  retirement: RetirementResponse | null;
}
