import type {
  AccountType,
  BucketMode,
  BucketStatus,
  Cents,
  Direction,
  EntryKind,
  SettlementStatus,
  ShiftPolicy,
  TemplateStatus,
} from '@fin/contracts';

/**
 * The whole dataset as state rather than as the derived views the read
 * endpoints return, and the shape a finished setup conversation is composed
 * into before it is written (UC-1.5).
 *
 * It never leaves the process: nothing exports it and nothing imports one, so
 * it carries no version. It is a shape two application services agree on, not
 * a file format anybody else has to read.
 */

/**
 * A union rather than one shape with optional fields: an origin that is not an
 * override has no `projected`, and a reader should not have to wonder what a
 * missing one meant.
 */
export type SetupEntryOrigin =
  | { kind: 'MANUAL' }
  | { kind: 'FROM_TEMPLATE'; ref: string }
  | { kind: 'FROM_ALLOCATION'; ref: string }
  | {
      kind: 'OVERRIDE';
      /** What was overridden, and what it would have projected. */
      original: SetupEntryOrigin;
      projected: Cents;
    };

export interface SetupEntry {
  id: string;
  description: string;
  kind: EntryKind;
  dueDate: string;
  planned: Cents;
  actual: Cents | null;
  status: SettlementStatus;
  isEstimate: boolean;
  origin: SetupEntryOrigin;
}

export interface SetupCycle {
  month: string;
  status: 'OPEN' | 'CLOSED';
  openingBalance: Cents;
  entries: SetupEntry[];
}

export interface SetupAccount {
  id: string;
  name: string;
  type: AccountType;
  balance: Cents;
}

export interface SetupTemplate {
  id: string;
  name: string;
  direction: Direction;
  dueDayOfMonth: number;
  amount: Cents;
  startMonth: string;
  endMonth: string | null;
  status: TemplateStatus;
  isEstimate: boolean;
  valueSchedule: { fromMonth: string; amount: Cents }[];
}

/** The append-only log, one variant per kind — see `BucketEvent`. */
export type SetupBucketEvent =
  | { kind: 'CONTRIBUTION'; id: string; cycleMonth: string; amount: Cents }
  | {
      kind: 'OVERRIDE';
      id: string;
      cycleMonth: string;
      amount: Cents;
      ruleWouldHaveBeen: Cents;
    }
  | { kind: 'YIELD'; id: string; date: string; amount: Cents }
  | {
      kind: 'CORRECTION';
      id: string;
      date: string;
      newBalance: Cents;
      reason: string;
    }
  | {
      kind: 'WITHDRAWAL';
      id: string;
      date: string;
      amount: Cents;
      reason: string;
    };

export interface SetupBucket {
  id: string;
  name: string;
  purpose: string;
  mode: BucketMode;
  status: BucketStatus;
  priority: number;
  /** A goal has both; an ongoing bucket has neither. */
  target: { amount: Cents; date: string } | null;
  rule:
    { kind: 'PERCENT'; basisPoints: number } | { kind: 'FIXED'; amount: Cents };
  expectedYieldBasisPoints: number | null;
  events: SetupBucketEvent[];
}

export interface SetupDocument {
  composedAt: string;
  anchor: { anchorDay: number; shiftPolicy: ShiftPolicy };
  accounts: SetupAccount[];
  cycles: SetupCycle[];
  templates: SetupTemplate[];
  buckets: SetupBucket[];
}
