import { useWealth } from '@/entities/dashboard';
import { Skeleton } from '@/shared/ui';

import { NetWorthBars } from './net-worth-bars.js';
import { RetirementCard } from './retirement-card.js';

/**
 * UC-7 — where the current savings rate lands in 5, 10, 20 and 30 years. It
 * sits beneath the buckets that feed it, and every yield in it is an
 * assumption rather than a figure the app knows.
 */
export function WealthSection({ month }: { month: string | undefined }) {
  const { data, isPending } = useWealth(month);

  if (isPending || data === undefined) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (data.buckets.length === 0) {
    return null;
  }

  return (
    <>
      <NetWorthBars data={data} />
      {data.retirement !== null && (
        <RetirementCard retirement={data.retirement} />
      )}
    </>
  );
}
