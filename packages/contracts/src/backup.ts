import type { AccountType } from './accounts.js';
import type { BucketMode, BucketStatus } from './buckets.js';
import type { EntryKind, SettlementStatus } from './cycles.js';
import type { Cents } from './money.js';
import type { ShiftPolicy } from './settings.js';
import type { Direction, TemplateStatus } from './templates.js';

/**
 * UC-1.6 — the whole dataset, as state rather than as the derived views the
 * read endpoints return. This is the user's only recovery mechanism, so the
 * shape is a contract with their own backup file: it may gain fields, but an
 * existing one never changes meaning without the version moving.
 */
export const BACKUP_VERSION = 1;

/**
 * A union rather than one shape with optional fields: an origin that is not an
 * override has no `projected`, and a reader should not have to wonder what a
 * missing one meant.
 */
export type BackupEntryOrigin =
  | { kind: 'MANUAL' }
  | { kind: 'FROM_TEMPLATE'; ref: string }
  | { kind: 'FROM_ALLOCATION'; ref: string }
  | {
      kind: 'OVERRIDE';
      /** What was overridden, and what it would have projected. */
      original: BackupEntryOrigin;
      projected: Cents;
    };

export interface BackupEntry {
  id: string;
  description: string;
  kind: EntryKind;
  dueDate: string;
  planned: Cents;
  actual: Cents | null;
  status: SettlementStatus;
  isEstimate: boolean;
  origin: BackupEntryOrigin;
}

export interface BackupCycle {
  month: string;
  status: 'OPEN' | 'CLOSED';
  openingBalance: Cents;
  entries: BackupEntry[];
}

export interface BackupAccount {
  id: string;
  name: string;
  type: AccountType;
  balance: Cents;
}

export interface BackupTemplate {
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
export type BackupBucketEvent =
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

export interface BackupBucket {
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
  events: BackupBucketEvent[];
}

export interface BackupDocument {
  version: number;
  exportedAt: string;
  anchor: { anchorDay: number; shiftPolicy: ShiftPolicy };
  accounts: BackupAccount[];
  cycles: BackupCycle[];
  templates: BackupTemplate[];
  buckets: BackupBucket[];
}
