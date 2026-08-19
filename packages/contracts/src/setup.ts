import type { AccountType } from './accounts.js';
import type { AllocationRuleRequest } from './buckets.js';
import type { Cents } from './money.js';
import type { ShiftPolicy } from './settings.js';

/**
 * What the first run still has to do — UC-1.5. `anchorConfigured` is tracked
 * separately from the anchor value because the anchor always reads back a
 * default, so its value can never say whether anyone chose it.
 */
export interface SetupStateResponse {
  anchorConfigured: boolean;
  accounts: number;
  cards: number;
  templates: number;
  buckets: number;
  /** Nothing configured and nothing created — the app as it ships. */
  isPristine: boolean;
  /**
   * Whether the conversational setup can run. Reported here so the client
   * chooses the plain-form fallback before the user starts typing rather than
   * after the first turn comes back refused.
   */
  assistantAvailable: boolean;
}

/** The order the setup conversation asks in; each depends on the last. */
export type SetupSection =
  | 'ANCHOR'
  | 'ACCOUNTS'
  | 'SALARY'
  | 'FIXED_BILLS'
  | 'VARIABLE_BILLS'
  | 'CARDS'
  | 'BUCKETS';

/**
 * One turn of the setup conversation. The transcript never travels: the
 * server holds it and the client carries only the id it was given back.
 */
export interface SetupTurnRequest {
  message: string;
  /** Absent on the first turn, the previous turn's id on every one after. */
  conversationId?: string;
}

/** One account the setup established. */
export interface EstablishedAccountFields {
  name: string;
  type: AccountType;
  balance: Cents;
}

/** One bill the setup established, fixed or variable. */
export interface EstablishedBillFields {
  name: string;
  /** Outgoing, so negative — the sign the ledger and the templates use. */
  amount: Cents;
  dueDayOfMonth: number;
  isEstimate: boolean;
}

export interface EstablishedCardFields {
  name: string;
  limit: Cents;
  closingDay: number;
  dueDay: number;
  paymentAccountName: string;
}

/**
 * A goal carries its target and an ongoing bucket carries none, so asking an
 * ongoing bucket what it is aiming at does not compile — UC-6.1.
 */
export type EstablishedBucketFields =
  | {
      mode: 'GOAL';
      name: string;
      rule: AllocationRuleRequest;
      priority: number;
      target: Cents;
      /** `YYYY-MM-DD`. */
      targetDate: string;
    }
  | {
      mode: 'ONGOING';
      name: string;
      rule: AllocationRuleRequest;
      priority: number;
    };

interface EstablishedRecordBase {
  /**
   * What a correction names it by — `null` for the sections holding a single
   * value, which are answered again rather than corrected.
   */
  id: string | null;
  /** The record as a sentence, for a person to read. */
  summary: string;
}

/**
 * One thing the turn established: the sentence it is shown as, and the fields
 * behind it.
 *
 * The summary is what the user reads; it is never what the client reads. A
 * client that took the fields back out of the prose would break silently the
 * day the wording changed, with the test that would have caught it on the
 * other side of the wire — FIN-124.
 *
 * The section is the tag, as it is on the draft itself, so a card's fields
 * cannot be read off a bucket record.
 */
export type EstablishedRecordResponse =
  | (EstablishedRecordBase & {
      section: 'ANCHOR' | 'SALARY';
      /** A single value, answered again rather than corrected. */
      fields: null;
    })
  | (EstablishedRecordBase & {
      section: 'ACCOUNTS';
      fields: EstablishedAccountFields;
    })
  | (EstablishedRecordBase & {
      section: 'FIXED_BILLS' | 'VARIABLE_BILLS';
      fields: EstablishedBillFields;
    })
  | (EstablishedRecordBase & {
      section: 'CARDS';
      fields: EstablishedCardFields;
    })
  | (EstablishedRecordBase & {
      section: 'BUCKETS';
      fields: EstablishedBucketFields;
    });

export interface SetupTurnResponse {
  conversationId: string;
  message: string;
  established: EstablishedRecordResponse[];
  /** The ids of the records the turn dropped, which are shown back no more. */
  removed: string[];
  /** What the turn would not accept, and why. */
  corrections: string[];
  /** `null` once every section has been answered or skipped. */
  nextSection: SetupSection | null;
  isComplete: boolean;
  /** The model declined — a well-formed answer, not a failure. */
  wasRefused: boolean;
}

/** What applying a finished setup conversation created. */
export interface SetupAppliedResponse {
  anchorDay: number;
  shiftPolicy: ShiftPolicy;
  accounts: number;
  templates: number;
  cards: number;
  buckets: number;
}

/**
 * One cycle in the rolling window that cannot reach a due day, and the day it
 * offers instead — its own last day. UC-1.7, FIN-117.
 */
export interface SetupUnreachableCycleResponse {
  /** `YYYY-MM`, the month the cycle is named for. */
  month: string;
  /** "September 2026" — never a bare month name without its bounds. */
  label: string;
  range: string;
  /** `YYYY-MM-DD`. */
  fallbackDate: string;
  fallbackDayOfMonth: number;
}

/**
 * A refused due day, as an offer rather than a dead end: the day that could
 * not be placed, and the cycles that could not place it. A bill on the 4th is
 * a real bill, and roughly twice a year a cycle ends on the 3rd.
 */
export interface SetupDueDayRefusalResponse {
  error: string;
  dueDayOfMonth: number;
  cycles: SetupUnreachableCycleResponse[];
}

/**
 * UC-1.5 — an inline edit of a record the conversation established: the
 * fields that change, and nothing else. Anything left out keeps whatever the
 * record already holds, and a field belonging to another kind of record is
 * not read.
 *
 * There is no model in this path. The prose case — *"actually the health plan
 * is 350"* — is a language problem and stays on the conversation route; a
 * form the user has already filled in is not, and paying for a model call to
 * read back what was typed would be spend with no ambiguity to resolve.
 */
export interface SetupRecordCorrectionRequest {
  name?: string;
  /** An account: what kind it is, and what is in it. */
  type?: AccountType;
  balance?: Cents;
  /** A bill: what it costs, the day it falls due, whether it is a guess. */
  amount?: Cents;
  dueDayOfMonth?: number;
  isEstimate?: boolean;
  /**
   * The offer a refused due day came back with, taken: the cycles that cannot
   * reach the day use their own last day, and the day stands everywhere else.
   */
  acceptCycleFallback?: boolean;
  /** A card: the limit, the two days, and the account that pays it. */
  limit?: Cents;
  closingDay?: number;
  dueDay?: number;
  paymentAccountName?: string;
  /** A bucket: how much goes in each cycle, and a goal's target. */
  rule?: AllocationRuleRequest;
  target?: Cents;
  targetDate?: string;
}
