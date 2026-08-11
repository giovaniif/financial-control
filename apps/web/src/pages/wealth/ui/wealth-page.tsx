import type { WealthProjectionResponse } from '@fin/contracts';

import { useWealth } from '@/entities/dashboard';
import { useSelectedCycle } from '@/features/navigate-cycle';
import { formatBRLCompact } from '@/shared/lib';
import {
  Amount,
  Badge,
  Card,
  CardTitle,
  EmptyState,
  Skeleton,
} from '@/shared/ui';
import { AppShell } from '@/widgets/app-shell';

/** UC-7 — where the current savings rate lands in 5, 10, 20 and 30 years. */
export function WealthPage() {
  const { selectedMonth } = useSelectedCycle();
  const { data, isPending } = useWealth(selectedMonth);

  return (
    <AppShell
      title="Wealth Projection"
      subtitle="Where the current rate lands — buckets only, and every yield is an assumption"
    >
      {isPending || data === undefined ? (
        <Skeleton className="h-64 w-full" />
      ) : data.buckets.length === 0 ? (
        <EmptyState
          title="Nothing to project"
          body="The projection models buckets. Create one and it appears here."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <Bars data={data} />
          <div className="flex flex-col gap-2">
            <CardTitle>What that means, per bucket</CardTitle>
            {data.buckets.map((bucket) => (
              <Sentence key={bucket.bucketId} bucket={bucket} />
            ))}
          </div>
          {data.retirement !== null && (
            <Card className="flex flex-col gap-1">
              <CardTitle>Retirement</CardTitle>
              <p className="text-sm">
                In 30 years it holds{' '}
                <Amount
                  cents={data.retirement.balanceAtHorizon}
                  className="font-semibold"
                />
                , which sustains{' '}
                <Amount
                  cents={data.retirement.sustainableMonthlyIncome}
                  className="font-semibold"
                />{' '}
                a month.
              </p>
              {/* Measured in monthly income, because that is the real question. */}
              <p className="text-xs text-zinc-500">
                At a 4 % withdrawal rate. An assumption, like every yield here.
              </p>
            </Card>
          )}
        </div>
      )}
    </AppShell>
  );
}

function Bars({ data }: { data: WealthProjectionResponse }) {
  const max = Math.max(...data.horizons.map((h) => h.total), 1);
  const palette = [
    'bg-teal-600',
    'bg-amber-600',
    'bg-indigo-600',
    'bg-violet-600',
    'bg-zinc-500',
  ] as const;
  const colourOf = (index: number) =>
    palette[index % palette.length] ?? 'bg-zinc-500';

  return (
    <Card className="flex flex-col gap-4">
      <CardTitle>Net worth, stacked by bucket</CardTitle>
      <div className="flex h-56 items-end gap-6">
        {data.horizons.map((horizon) => (
          <div
            key={horizon.years}
            className="flex flex-1 flex-col items-center gap-2"
          >
            <span className="font-mono text-xs font-medium">
              {formatBRLCompact(horizon.total)}
            </span>
            <div
              className="flex w-full max-w-24 flex-col-reverse overflow-hidden rounded-md"
              style={{
                height: `${String(Math.max(4, (horizon.total / max) * 100))}%`,
              }}
            >
              {horizon.byBucket.map((slice, index) => (
                <div
                  key={slice.bucketId}
                  className={colourOf(index)}
                  style={{
                    height: `${String((slice.amount / Math.max(1, horizon.total)) * 100)}%`,
                  }}
                  title={`${slice.name}: ${formatBRLCompact(slice.amount)}`}
                />
              ))}
            </div>
            <span className="text-xs text-zinc-500">{horizon.years} years</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-zinc-600">
        {(data.horizons[0]?.byBucket ?? []).map((slice, index) => (
          <span key={slice.bucketId} className="flex items-center gap-1.5">
            <span className={`size-2 rounded-sm ${colourOf(index)}`} />
            {slice.name}
          </span>
        ))}
      </div>
    </Card>
  );
}

/** UC-7.3 — one plain sentence per bucket, in its own terms. */
function Sentence({
  bucket,
}: {
  bucket: WealthProjectionResponse['buckets'][number];
}) {
  const rate = `${String(bucket.expectedYieldPercent)} % a year`;
  const perCycle = <Amount cents={bucket.contributionPerCycle} />;

  return (
    <Card className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{bucket.name}</span>
        {bucket.isGoal ? (
          <Badge tone={bucket.isOnTrack === true ? 'positive' : 'critical'}>
            {bucket.isOnTrack === true ? 'on track' : 'behind'}
          </Badge>
        ) : (
          <Badge tone="info">ongoing</Badge>
        )}
      </div>

      {bucket.isGoal ? (
        <p className="text-sm text-zinc-600">
          At {perCycle} per cycle and {rate}, {bucket.name}{' '}
          {bucket.reachesTargetIn === null ? (
            <>never reaches its target.</>
          ) : (
            <>
              reaches its target in {bucket.reachesTargetIn} cycles
              {bucket.targetDate === null
                ? ''
                : `, targeted at ${bucket.targetDate}`}
              .
            </>
          )}
        </p>
      ) : (
        <p className="text-sm text-zinc-600">
          At {perCycle} per cycle and {rate}, {bucket.name} holds{' '}
          {bucket.inFiveYears === null ? (
            '—'
          ) : (
            <Amount cents={bucket.inFiveYears} compact />
          )}{' '}
          in 5 years and{' '}
          {bucket.inTenYears === null ? (
            '—'
          ) : (
            <Amount cents={bucket.inTenYears} compact />
          )}{' '}
          in 10. No target to hit — the question is only whether the rate is
          right.
        </p>
      )}

      {bucket.contributionToCatchUp !== null && (
        <p className="text-sm text-red-700">
          <Amount cents={bucket.contributionToCatchUp} /> per cycle would bring
          it back.
        </p>
      )}
    </Card>
  );
}
