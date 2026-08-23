import type { WealthProjectionResponse } from '@fin/contracts';

import { formatBRLCompact } from '@/shared/lib';
import { Amount, Card, CardTitle } from '@/shared/ui';

const palette = [
  'bg-teal-600',
  'bg-amber-600',
  'bg-indigo-600',
  'bg-violet-600',
  'bg-zinc-500',
] as const;

const colourOf = (index: number) =>
  palette[index % palette.length] ?? 'bg-zinc-500';

/**
 * UC-7.2 — stacked by bucket, so the composition of future wealth is visible
 * and not only the total. Archived buckets are gone from it entirely.
 */
export function NetWorthBars({ data }: { data: WealthProjectionResponse }) {
  const max = Math.max(...data.horizons.map((horizon) => horizon.total), 1);

  return (
    <Card label="Net worth" className="flex flex-col gap-4">
      <CardTitle>Net worth, stacked by bucket</CardTitle>
      <div className="flex h-56 items-end gap-6">
        {data.horizons.map((horizon) => (
          <div
            key={horizon.years}
            className="flex flex-1 flex-col items-center gap-2"
          >
            <Amount
              cents={horizon.total}
              compact
              className="text-xs font-medium"
            />
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
      <p className="text-xs text-zinc-500">
        Assuming today&rsquo;s rules keep contributing and each bucket compounds
        at its expected yield — assumptions, not facts.
      </p>
    </Card>
  );
}
