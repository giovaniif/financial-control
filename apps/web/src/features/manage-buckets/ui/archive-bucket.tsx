import type { BucketResponse } from '@fin/contracts';

import { Button } from '@/shared/ui';

import { useUpdateBucket } from '../api/use-manage-buckets.js';

/**
 * UC-6.8 — an achieved-and-spent goal is archived rather than deleted. The
 * history is the point, and a bucket that reached its target is evidence.
 */
export function ArchiveBucket({
  bucket,
}: {
  bucket: Pick<BucketResponse, 'id' | 'name' | 'status'>;
}) {
  const update = useUpdateBucket(bucket.id);

  if (bucket.status === 'ARCHIVED') {
    return null;
  }

  return (
    <Button
      aria-label={`Arquivar ${bucket.name}`}
      disabled={update.isPending}
      onClick={() => {
        update.mutate({ status: 'ARCHIVED' });
      }}
    >
      Arquivar
    </Button>
  );
}
