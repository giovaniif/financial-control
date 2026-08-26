import type { BucketView } from '@/entities/bucket';
import { CreateBucketButton } from '@/features/create-bucket';
import { Card, CardTitle } from '@/shared/ui';

import { BucketActions } from './bucket-actions.js';
import { BucketSummary } from './bucket-summary.js';

interface Props {
  buckets: BucketView[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  /** The cycle an override or a contribution would land in. */
  month: string;
}

/** UC-6 — every pot of savings, and which one the rest of the screen is about. */
export function BucketsSection({
  buckets,
  selectedId,
  onSelect,
  month,
}: Props) {
  return (
    <Card label="Caixinhas" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <CardTitle>Caixinhas</CardTitle>
        <CreateBucketButton existingCount={buckets.length} />
      </div>
      {/* One row rather than a wrapping grid: these cards are peers being
          compared, and a grid lets the number of buckets decide the shape —
          a fifth one silently re-flows the four already there. Left to right
          is also the order the funding actually runs in (UC-6.3).
          Focusable so the cards past the edge are reachable without a
          trackpad gesture (WCAG 2.1.1). */}
      <div
        role="group"
        aria-label="Suas caixinhas"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-1"
      >
        {buckets.map((bucket) => (
          /* A card, not a button: its actions live on it, and a trigger
             inside a button is a button inside a button. The selection is
             its own control beside them. */
          <div
            key={bucket.id}
            className={`flex min-w-52 flex-1 snap-start flex-col gap-2 rounded-xl border bg-white p-4 transition-colors ${
              bucket.id === selectedId
                ? 'border-zinc-900'
                : 'border-zinc-200 hover:border-zinc-300'
            } ${bucket.status === 'ARCHIVED' ? 'opacity-55' : ''}`}
          >
            <div className="flex items-start justify-between gap-2">
              <button
                type="button"
                // The card carries figures and badges, so the control says
                // plainly what pressing it does rather than reading its whole
                // contents out.
                aria-label={`Selecionar ${bucket.name}`}
                aria-pressed={bucket.id === selectedId}
                onClick={() => {
                  onSelect(bucket.id);
                }}
                className="min-w-0 flex-1 cursor-pointer text-left"
              >
                <BucketSummary bucket={bucket} />
              </button>
              <BucketActions bucket={bucket} month={month} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
