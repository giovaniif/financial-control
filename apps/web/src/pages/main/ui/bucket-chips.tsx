import { Link } from 'react-router';

import { useBuckets } from '@/entities/bucket';
import { Amount, Card, CardTitle } from '@/shared/ui';

/** UC-4.6 — each bucket as a compact chip, one click through to UC-6. */
export function BucketChips() {
  const { data } = useBuckets();
  const buckets = (data ?? []).filter((bucket) => bucket.status === 'ACTIVE');

  if (buckets.length === 0) {
    return null;
  }

  return (
    <Card label="Caixinhas" className="flex flex-col gap-3">
      <CardTitle>Caixinhas</CardTitle>
      {buckets.map((bucket) => (
        <Link
          key={bucket.id}
          to="/savings"
          className="flex flex-col gap-1 rounded-lg transition-colors hover:bg-zinc-50"
        >
          <div className="flex items-baseline justify-between text-sm">
            <span>{bucket.name}</span>
            <Amount cents={bucket.balance} className="text-xs" />
          </div>
          {/* A goal shows progress; an ongoing bucket has nothing to complete. */}
          {bucket.percentComplete === null ? (
            <span className="text-xs text-zinc-500">
              contínua — sem objetivo a atingir
            </span>
          ) : (
            <>
              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-teal-600"
                  style={{ width: `${String(bucket.percentComplete)}%` }}
                />
              </div>
              <span className="text-xs text-zinc-500">
                {bucket.percentComplete}% de{' '}
                {bucket.target === null ? (
                  '—'
                ) : (
                  <Amount cents={bucket.target} />
                )}
              </span>
            </>
          )}
        </Link>
      ))}
    </Card>
  );
}
