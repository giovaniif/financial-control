import type {
  BucketProjectionView,
  GoalProjection,
  OngoingProjection,
} from '@/entities/bucket';
import {
  formatBRL,
  formatMonthLabel,
  formatMonthOf,
  formatPercent,
  shiftMonth,
} from '@/shared/lib';
import { Amount, Badge, Card, Field } from '@/shared/ui';

interface Props {
  projection: BucketProjectionView;
  /** The cycle the projection counts from — the one the header has selected. */
  fromMonth: string | undefined;
  yieldPercent: string;
  onYieldChange: (percent: string) => void;
}

/** UC-7.3 — one plain sentence per bucket, in that bucket's own terms. */
export function BucketSentence({
  projection,
  fromMonth,
  yieldPercent,
  onYieldChange,
}: Props) {
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{projection.name}</span>
        {projection.mode === 'GOAL' ? (
          <Badge tone={projection.isOnTrack ? 'positive' : 'critical'}>
            {projection.isOnTrack ? 'on track' : 'behind'}
          </Badge>
        ) : (
          <Badge tone="info">ongoing</Badge>
        )}
      </div>

      {projection.mode === 'GOAL' ? (
        <GoalSentence projection={projection} fromMonth={fromMonth} />
      ) : (
        <OngoingSentence projection={projection} />
      )}

      {/* UC-7.1 and UC-7.4 — the assumption sits with the number it moves. */}
      <Field
        label="Expected annual yield"
        aria-label={`Expected annual yield for ${projection.name}`}
        type="number"
        value={yieldPercent}
        onChange={(event) => {
          onYieldChange(event.target.value);
        }}
        hint="An assumption. Adjusting it here moves the projection; saving it on the bucket's rule is what keeps it."
      />
    </Card>
  );
}

function GoalSentence({
  projection,
  fromMonth,
}: {
  projection: GoalProjection;
  fromMonth: string | undefined;
}) {
  return (
    <>
      <p className="text-sm text-zinc-600">
        At <Amount cents={projection.contributionPerCycle} /> per cycle and{' '}
        {formatPercent(projection.expectedYieldPercent)} a year,{' '}
        {projection.name}{' '}
        {projection.reachesTargetIn === null ? (
          <>
            never reaches <Amount cents={projection.target} />.
          </>
        ) : (
          <>
            reaches <Amount cents={projection.target} />{' '}
            {arrival(fromMonth, projection.reachesTargetIn)}.
          </>
        )}
        {projection.targetDate !== null &&
          ` Target: ${formatMonthOf(projection.targetDate)}.`}
      </p>

      {projection.contributionToCatchUp !== null && (
        <p role="alert" className="text-sm text-red-700">
          {formatBRL(projection.contributionToCatchUp)} per cycle would bring it
          back.
        </p>
      )}
    </>
  );
}

function OngoingSentence({ projection }: { projection: OngoingProjection }) {
  return (
    <p className="text-sm text-zinc-600">
      At <Amount cents={projection.contributionPerCycle} /> per cycle and{' '}
      {formatPercent(projection.expectedYieldPercent)} a year, {projection.name}{' '}
      holds{' '}
      {projection.inFiveYears === null ? (
        '—'
      ) : (
        <Amount cents={projection.inFiveYears} compact />
      )}{' '}
      in 5 years and{' '}
      {projection.inTenYears === null ? (
        '—'
      ) : (
        <Amount cents={projection.inTenYears} compact />
      )}{' '}
      in 10. No target to hit — the question is only whether the rate is right.
    </p>
  );
}

/**
 * The projection counts in cycles from the one on screen. Without a cycle to
 * count from there is no month to name, and saying so beats naming a wrong one.
 */
function arrival(fromMonth: string | undefined, cycles: number): string {
  return fromMonth === undefined
    ? `in ${String(cycles)} cycles`
    : `in ${formatMonthLabel(shiftMonth(fromMonth, cycles))}`;
}
