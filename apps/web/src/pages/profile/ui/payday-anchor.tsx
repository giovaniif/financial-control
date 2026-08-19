import type { AnchorSettingsResponse } from '@fin/contracts';
import { useQuery } from '@tanstack/react-query';

import { ChangeAnchor } from '@/features/configure-anchor';
import { api, queryKeys } from '@/shared/api';
import { Card, CardTitle, Skeleton } from '@/shared/ui';

/** UC-1.1 — the day salary lands, and what happens when it lands on a Sunday. */
export function PaydayAnchor() {
  const { data, isPending } = useQuery({
    queryKey: queryKeys.anchor(),
    queryFn: () => api<AnchorSettingsResponse>('/settings/anchor'),
  });

  return (
    <Card className="flex flex-col gap-3">
      <CardTitle>Payday anchor</CardTitle>
      {isPending || data === undefined ? (
        <Skeleton className="h-10 w-40" />
      ) : (
        <>
          <p className="text-sm">
            Salary lands on day{' '}
            <strong className="font-mono">{data.anchorDay}</strong>, moving to
            the {data.shiftPolicy === 'PRECEDING' ? 'preceding' : 'following'}{' '}
            business day when that falls on a weekend or a holiday.
          </p>
          {/* Changing it re-slices every open cycle, so it is never silent. */}
          <p className="text-xs text-zinc-500">
            Changing the anchor re-slices every open cycle. Closed cycles are
            never touched, and the change is previewed before it applies.
          </p>
          <div>
            <ChangeAnchor
              anchorDay={data.anchorDay}
              shiftPolicy={data.shiftPolicy}
            />
          </div>
        </>
      )}
    </Card>
  );
}
