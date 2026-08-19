import { useBuckets } from '@/entities/bucket';
import { CreateBucketButton } from '@/features/create-bucket';
import { formatBRL } from '@/shared/lib';
import { Amount, Badge, Skeleton } from '@/shared/ui';

/** UC-6.1 / UC-6.2 — where the Expected Surplus goes each cycle. */
export function BucketsStep() {
  const { data, isPending } = useBuckets();
  const buckets = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 text-zinc-600">
        <p>
          What is left after the bills is the{' '}
          <strong className="font-medium text-zinc-900">
            Expected Surplus
          </strong>
          , and buckets are where it goes. Each one takes a share of every cycle
          automatically.
        </p>
        <p>
          A bucket is either a{' '}
          <strong className="font-medium text-zinc-900">goal</strong> — a target
          amount by a target date, like six months of expenses by next March —
          or <strong className="font-medium text-zinc-900">ongoing</strong>, a
          per-cycle commitment with no finish line, like a brokerage
          contribution. The distinction is real: asking an ongoing bucket how
          complete it is has no answer, so the app never pretends it does.
        </p>
      </div>

      {isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : buckets.length > 0 ? (
        <ul className="divide-y divide-zinc-100 text-sm">
          {buckets.map((bucket) => (
            <li key={bucket.id} className="flex items-center gap-3 py-1.5">
              <span className="flex-1">{bucket.name}</span>
              <Badge tone={bucket.mode === 'GOAL' ? 'info' : 'neutral'}>
                {bucket.mode.toLowerCase()}
              </Badge>
              <span className="text-xs text-zinc-500">
                {bucket.rule.kind === 'PERCENT'
                  ? `${String(bucket.rule.percent)}% per cycle`
                  : `${formatBRL(bucket.rule.amount)} per cycle`}
              </span>
              {bucket.target !== null && (
                <Amount cents={bucket.target} className="w-28 text-right" />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">
          No buckets yet. You can add them later, but a cycle with no buckets
          leaves every surplus as free cash.
        </p>
      )}

      <div>
        <CreateBucketButton existingCount={buckets.length} />
      </div>
    </div>
  );
}
