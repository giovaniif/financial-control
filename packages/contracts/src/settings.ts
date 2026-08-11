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
