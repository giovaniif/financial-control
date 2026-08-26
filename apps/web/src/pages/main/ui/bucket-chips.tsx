import type { BucketResponse, FundingResponse } from '@fin/contracts';
import { Link } from 'react-router';

import { useBuckets } from '@/entities/bucket';
import { useAllocationPreview } from '@/features/manage-buckets';
import { formatPercent } from '@/shared/lib';
import { Amount, Card, CardTitle } from '@/shared/ui';

/**
 * UC-4.6 — each bucket as a compact chip, one click through to UC-6.
 *
 * The figure is what goes in **this cycle**, because that is what the card is
 * read for. The balance is what that is building, and follows it.
 */
export function BucketChips({ month }: { month: string | undefined }) {
  const { data } = useBuckets();
  // The hook holds off on an empty month, which is what a cycle not yet
  // resolved looks like.
  const preview = useAllocationPreview(month ?? '');
  const buckets = (data ?? []).filter((bucket) => bucket.status === 'ACTIVE');

  if (buckets.length === 0) {
    return null;
  }

  const funding = new Map(
    (preview.data?.fundings ?? []).map((one) => [one.bucketId, one]),
  );

  return (
    <Card label="Caixinhas" className="flex flex-col gap-3">
      <CardTitle>Caixinhas</CardTitle>
      {buckets.map((bucket) => (
        <Link
          key={bucket.id}
          to="/savings"
          className="flex flex-col gap-1 rounded-lg transition-colors hover:bg-zinc-50"
        >
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span>{bucket.name}</span>
            <Contribution funding={funding.get(bucket.id)} />
          </div>
          <span className="text-xs text-zinc-500">
            {describeRule(bucket.rule)} · acumulado{' '}
            <Amount cents={bucket.balance} />
          </span>
          {/* A goal shows progress; an ongoing bucket has nothing to complete. */}
          {bucket.percentComplete !== null && (
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

/**
 * What the rules actually put in, which is not always what they asked for:
 * UC-6.4 funds in priority order and the money can run out part-way down.
 */
function Contribution({ funding }: { funding: FundingResponse | undefined }) {
  if (funding === undefined) {
    return <span className="text-xs text-zinc-400">—</span>;
  }

  return (
    <span className="flex items-baseline gap-2 whitespace-nowrap">
      {!funding.isFullyFunded && (
        <span className="text-xs text-amber-700">parcial</span>
      )}
      <Amount cents={funding.funded} className="text-xs" />
    </span>
  );
}

function describeRule(rule: BucketResponse['rule']): string {
  return rule.kind === 'PERCENT'
    ? `${formatPercent(rule.percent)} da Sobra Esperada`
    : 'valor fixo por ciclo';
}
