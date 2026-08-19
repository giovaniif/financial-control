/** Which way pay moves when the anchor lands on a weekend or a holiday. */
export type ShiftPolicy = 'PRECEDING' | 'FOLLOWING';

export interface AnchorSettingsResponse {
  anchorDay: number;
  shiftPolicy: ShiftPolicy;
}

export interface AnchorChangeRequest {
  anchorDay: number;
  shiftPolicy: ShiftPolicy;
}

/** One cycle as a proposed anchor would slice it. Nothing is persisted. */
export interface ResolvedCycleResponse {
  month: string;
  label: string;
  /** ISO dates; the frontend owns the dd/MM/yyyy rendering. */
  start: string;
  end: string;
  /** Payday landed on a weekend or holiday and moved by the policy. */
  shifted: boolean;
  /** The anchor day ran past the month's length and clamped onto its end. */
  clamped: boolean;
}

export interface AnchorResolveResponse {
  cycles: ResolvedCycleResponse[];
}

/** One open cycle's boundaries before and after a proposed anchor change. */
export interface CycleShiftResponse {
  month: string;
  currentRange: string;
  proposedRange: string;
  entriesLeaving: number;
}

/**
 * What changing the anchor would do. Closed cycles are never re-sliced, so
 * they never appear here.
 */
export interface AnchorChangePreviewResponse {
  current: AnchorSettingsResponse;
  proposed: AnchorSettingsResponse;
  shifts: CycleShiftResponse[];
  totalEntriesMoving: number;
  /** Entries that would fall outside every open cycle. Blocks the change. */
  orphanedEntries: number;
}
