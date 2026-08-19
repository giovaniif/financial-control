import { useState } from 'react';

import { toProjectionView } from '@/entities/bucket';
import { useWealth } from '@/entities/dashboard';
import { Card, CardTitle, Skeleton } from '@/shared/ui';

import { BucketSentence } from './bucket-sentence.js';
import { NetWorthBars } from './net-worth-bars.js';
import { RetirementCard } from './retirement-card.js';

/**
 * UC-7 — where the current savings rate lands in 5, 10, 20 and 30 years. It
 * sits beneath the buckets that feed it, and every yield in it is an
 * assumption rather than a figure the app knows.
 */
export function WealthSection({ month }: { month: string | undefined }) {
  // UC-7.4 — an assumption held here rather than saved, so a thirty-year
  // number can be pushed around without rewriting the bucket behind it.
  const [assumptions, setAssumptions] = useState<Record<string, string>>({});
  const { data, isPending } = useWealth(month, encode(assumptions));

  if (isPending || data === undefined) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (data.buckets.length === 0) {
    return null;
  }

  return (
    <>
      <NetWorthBars data={data} />

      <Card label="Por caixinha" className="flex flex-col gap-3">
        <CardTitle>Onde esse ritmo chega, por caixinha</CardTitle>
        {data.buckets.map((projection) => (
          <BucketSentence
            key={projection.bucketId}
            projection={toProjectionView(projection)}
            fromMonth={month}
            yieldPercent={
              assumptions[projection.bucketId] ??
              String(projection.expectedYieldPercent)
            }
            onYieldChange={(percent) => {
              setAssumptions((previous) => ({
                ...previous,
                [projection.bucketId]: percent,
              }));
            }}
          />
        ))}
      </Card>

      {data.retirement !== null && (
        <RetirementCard retirement={data.retirement} />
      )}
    </>
  );
}

/** `retirement:12,apartment:8` — what the projection endpoint reads. */
function encode(assumptions: Record<string, string>): string {
  return Object.entries(assumptions)
    .filter(([, percent]) => percent !== '')
    .map(([bucketId, percent]) => `${bucketId}:${percent}`)
    .join(',');
}
