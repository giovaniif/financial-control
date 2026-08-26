import type { EstimateMode } from './cycles.js';
import type { Cents } from './money.js';

/** The one-sentence answer, and the two numbers that qualify it. */
export interface HeadlineResponse {
  cycleMonth: string;
  cycleLabel: string;
  range: string;
  incoming: Cents;
  outgoing: Cents;
  free: Cents;
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

export interface DashboardResponse {
  today: string;
  currentCycleMonth: string;
  /** Which reading every figure below was taken in — UC-4.4. */
  estimates: EstimateMode;
  headline: HeadlineResponse;
  kpis: KpiResponse[];
  progress: CycleProgressResponse;
  /**
   * How the cycle came out against its plan — UC-3.6. `null` for a projected
   * cycle, which has no facts to compare a plan against. Zero is the
   * different answer that everything settled went exactly to plan, so the two
   * must not be rendered the same way.
   *
   * Negative is behind in both directions: a bill that cost more and a salary
   * that arrived short are both negative.
   */
  variance: Cents | null;
  upcoming: UpcomingEntryResponse[];
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
