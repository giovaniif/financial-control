import type { BucketResponse, Cents } from '@fin/contracts';

/**
 * Everything both kinds of bucket carry. The four fields a target is made of
 * are taken out and put back only on the kind that has one.
 */
type Common = Omit<
  BucketResponse,
  'mode' | 'target' | 'targetDate' | 'percentComplete'
>;

export interface GoalBucket extends Common {
  mode: 'GOAL';
  target: Cents;
  targetDate: string;
  percentComplete: number;
}

export interface OngoingBucket extends Common {
  mode: 'ONGOING';
}

/**
 * UC-6.1 — the wire type carries `target`, `targetDate` and `percentComplete`
 * as nullable fields, so nothing there stops a screen asking an ongoing bucket
 * how far along it is. Narrowing to this union first makes the question a type
 * error rather than a `null` to render around: an `OngoingBucket` has no
 * progress to read at all.
 */
export type BucketView = GoalBucket | OngoingBucket;

export function toBucketView(bucket: BucketResponse): BucketView {
  const { mode, target, targetDate, percentComplete, ...common } = bucket;

  // A goal is the whole triple or it is nothing. Filling in a missing half
  // would report progress toward a target that does not exist, which is the
  // one failure this distinction exists to prevent.
  if (
    mode === 'GOAL' &&
    target !== null &&
    targetDate !== null &&
    percentComplete !== null
  ) {
    return { ...common, mode, target, targetDate, percentComplete };
  }

  return { ...common, mode: 'ONGOING' };
}
