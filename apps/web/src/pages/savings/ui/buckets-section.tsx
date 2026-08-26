import type { BucketView } from '@/entities/bucket';
import { CreateBucketButton } from '@/features/create-bucket';
import { Card, CardTitle } from '@/shared/ui';

import { BucketSummary } from './bucket-summary.js';

interface Props {
  buckets: BucketView[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}

/** UC-6 — every pot of savings, and which one the rest of the screen is about. */
export function BucketsSection({ buckets, selectedId, onSelect }: Props) {
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
          <button
            key={bucket.id}
            type="button"
            // The card carries figures and badges, so the button says plainly
            // what pressing it does rather than reading its whole contents out.
            aria-label={`Selecionar ${bucket.name}`}
            aria-pressed={bucket.id === selectedId}
            onClick={() => {
              onSelect(bucket.id);
            }}
            className={`w-72 shrink-0 snap-start cursor-pointer rounded-xl border bg-white p-4 text-left transition-colors ${
              bucket.id === selectedId
                ? 'border-zinc-900'
                : 'border-zinc-200 hover:border-zinc-300'
            } ${bucket.status === 'ARCHIVED' ? 'opacity-55' : ''}`}
          >
            <BucketSummary bucket={bucket} />
          </button>
        ))}
      </div>
    </Card>
  );
}
