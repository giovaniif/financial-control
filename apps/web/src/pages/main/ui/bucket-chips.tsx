import type { BucketResponse, FundingResponse } from '@fin/contracts';
import { Link } from 'react-router';

import { useBuckets } from '@/entities/bucket';
import { useAllocationPreview } from '@/features/manage-buckets';
import { formatBRL, formatPercent } from '@/shared/lib';
import { Amount, Card, CardTitle } from '@/shared/ui';

/**
 * UC-4.6 — each bucket as a compact chip, one click through to UC-6.
 *
 * A row rather than a list, because this card sits between the figures and
 * the worklist and every line it takes is a line the worklist does not get.
 * The figure is what goes in **this cycle**, which is what the card is read
 * for; the rule and the balance follow it, abbreviated.
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
    <Card label="Caixinhas" className="flex flex-col gap-2">
      <CardTitle>Caixinhas</CardTitle>
      {/* Focusable so the chips past the edge are reachable without a
          trackpad gesture (WCAG 2.1.1), as on the savings screen. */}
      <div
        role="group"
        aria-label="Suas caixinhas"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1"
      >
        {buckets.map((bucket) => (
          <Link
            key={bucket.id}
            to="/savings"
            /* Shares the width when there is room and stops at a readable
               minimum when there is not — past that the strip scrolls rather
               than the chips becoming unreadable. */
            className="flex min-w-52 flex-1 flex-col gap-0.5 rounded-lg border border-zinc-200 px-3 py-2 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
          >
            <span className="truncate text-xs text-zinc-600">
              {bucket.name}
            </span>
            <Contribution funding={funding.get(bucket.id)} />
            <span className="truncate text-[11px] text-zinc-400">
              {qualifier(bucket)} · acum. {formatBRL(bucket.balance)}
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

/**
 * What the rules actually put in, which is not always what they asked for:
 * UC-6.4 funds in priority order and the money can run out part-way down.
 */
function Contribution({ funding }: { funding: FundingResponse | undefined }) {
  if (funding === undefined) {
    return <span className="font-mono text-sm text-zinc-400">—</span>;
  }

  return (
    <span className="flex items-baseline gap-1.5">
      <Amount cents={funding.funded} className="text-sm" />
      {!funding.isFullyFunded && (
        <span className="text-[11px] text-amber-700">parcial</span>
      )}
    </span>
  );
}

/**
 * UC-4.6 — a goal is read by how far along it is, an ongoing bucket by the
 * rate it is fed at. Both as a label rather than a sentence: this line
 * repeats on every chip, and the sentence was what made the card tall.
 */
function qualifier(bucket: BucketResponse): string {
  if (bucket.percentComplete !== null) {
    return `${String(bucket.percentComplete)}% da meta`;
  }

  return bucket.rule.kind === 'PERCENT'
    ? formatPercent(bucket.rule.percent)
    : 'valor fixo';
}
