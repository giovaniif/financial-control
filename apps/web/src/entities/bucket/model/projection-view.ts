import type { BucketProjectionResponse, Cents } from '@fin/contracts';

type Common = Omit<
  BucketProjectionResponse,
  | 'isGoal'
  | 'target'
  | 'targetDate'
  | 'reachesTargetIn'
  | 'isOnTrack'
  | 'contributionToCatchUp'
  | 'inFiveYears'
  | 'inTenYears'
>;

export interface GoalProjection extends Common {
  mode: 'GOAL';
  target: Cents;
  targetDate: string | null;
  /** Cycles from the one on screen. Null when the rate never gets there. */
  reachesTargetIn: number | null;
  isOnTrack: boolean;
  contributionToCatchUp: Cents | null;
}

export interface OngoingProjection extends Common {
  mode: 'ONGOING';
  inFiveYears: Cents | null;
  inTenYears: Cents | null;
}

/**
 * UC-7.3 — the two sentences are not one sentence with optional halves. A goal
 * is answered with the month it arrives against the month it was wanted; an
 * ongoing bucket has no arrival to speak of, so the type has no `isOnTrack` to
 * ask about.
 */
export type BucketProjectionView = GoalProjection | OngoingProjection;

export function toProjectionView(
  projection: BucketProjectionResponse,
): BucketProjectionView {
  const {
    isGoal,
    target,
    targetDate,
    reachesTargetIn,
    isOnTrack,
    contributionToCatchUp,
    inFiveYears,
    inTenYears,
    ...common
  } = projection;

  if (isGoal && target !== null) {
    return {
      ...common,
      mode: 'GOAL',
      target,
      targetDate,
      reachesTargetIn,
      // A goal the rate never reaches is not on track, and nothing else it
      // could be — an unknown here would read as reassurance.
      isOnTrack: isOnTrack ?? false,
      contributionToCatchUp,
    };
  }

  return { ...common, mode: 'ONGOING', inFiveYears, inTenYears };
}
