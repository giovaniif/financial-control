import type { Cents } from './money.js';

export type BucketMode = 'GOAL' | 'ONGOING';
export type BucketStatus = 'ACTIVE' | 'ARCHIVED';

export type AllocationRuleRequest =
  { kind: 'PERCENT'; percent: number } | { kind: 'FIXED'; amount: Cents };

export interface BucketEventResponse {
  id: string;
  kind: 'CONTRIBUTION' | 'OVERRIDE' | 'YIELD' | 'CORRECTION' | 'WITHDRAWAL';
  /** A cycle (`YYYY-MM`) for contributions, otherwise a date. */
  when: string;
  amount: Cents;
  reason: string | null;
  /** Only on an override: what the rule would have contributed. */
  ruleWouldHaveBeen: Cents | null;
}

export interface BucketResponse {
  id: string;
  name: string;
  purpose: string;
  mode: BucketMode;
  status: BucketStatus;
  priority: number;
  balance: Cents;
  /** Growth from saving, kept apart from growth from returns. */
  contributed: Cents;
  yielded: Cents;
  target: Cents | null;
  targetDate: string | null;
  /** Null for an ongoing bucket: there is no target to be part-way to. */
  percentComplete: number | null;
  rule: { kind: 'PERCENT'; percent: number } | { kind: 'FIXED'; amount: Cents };
  expectedYieldPercent: number | null;
  events: BucketEventResponse[];
}

export interface CreateGoalRequest {
  name: string;
  purpose?: string;
  target: Cents;
  targetDate: string;
  rule: AllocationRuleRequest;
  priority: number;
}

export interface CreateOngoingRequest {
  name: string;
  purpose?: string;
  rule: AllocationRuleRequest;
  priority: number;
}

/** What one bucket asked for, and what the priority order actually gave it. */
export interface FundingResponse {
  bucketId: string;
  name: string;
  requested: Cents;
  funded: Cents;
  isFullyFunded: boolean;
}

export interface AllocationPreviewResponse {
  month: string;
  expectedSurplus: Cents;
  fundings: FundingResponse[];
  shortfall: Cents;
  isOvercommitted: boolean;
}

/**
 * UC-6.1 — what a bucket is aiming at, or `null` to stop aiming. The mode
 * follows the target: a bucket with one is a goal, and one without is an
 * ongoing commitment, so the two are never sent apart.
 */
export interface SetBucketTargetRequest {
  target: { amount: Cents; date: string } | null;
}
