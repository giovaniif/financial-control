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
    <Card label="Buckets" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <CardTitle>Buckets</CardTitle>
        <CreateBucketButton existingCount={buckets.length} />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {buckets.map((bucket) => (
          <button
            key={bucket.id}
            type="button"
            // The card carries figures and badges, so the button says plainly
            // what pressing it does rather than reading its whole contents out.
            aria-label={`Select ${bucket.name}`}
            aria-pressed={bucket.id === selectedId}
            onClick={() => {
              onSelect(bucket.id);
            }}
            className={`cursor-pointer rounded-xl border bg-white p-4 text-left transition-colors ${
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
