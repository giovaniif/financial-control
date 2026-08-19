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

/** One thing the turn established, in the user's own terms. */
export interface EstablishedRecordResponse {
  section: SetupSection;
  /**
   * What a correction names it by — `null` for the sections holding a single
   * value, which are answered again rather than corrected.
   */
  id: string | null;
  summary: string;
}

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
