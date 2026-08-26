import type { BucketView } from '@/entities/bucket';
import {
  AdjustRule,
  ArchiveBucket,
  CorrectBalance,
  RecordEvent,
  SetGoal,
} from '@/features/manage-buckets';
import { Disclosure } from '@/shared/ui';

/**
 * Everything that can be done to one caixinha, on the caixinha.
 *
 * They used to sit in a row below the cards and act on whichever was
 * selected, so the link between a verb and its subject was selection state
 * held elsewhere on the screen — "Arquivar" archived something you had to
 * look away to identify. Here the action names its bucket by sitting on it.
 */
export function BucketActions({
  bucket,
  month,
}: {
  bucket: BucketView;
  month: string;
}) {
  return (
    <Disclosure label={`Ações de ${bucket.name}`}>
      <>
        <AdjustRule bucket={bucket} month={month} />
        <SetGoal bucket={bucket} />
        <CorrectBalance
          bucketId={bucket.id}
          bucketName={bucket.name}
          balance={bucket.balance}
        />
        <RecordEvent
          bucketId={bucket.id}
          bucketName={bucket.name}
          month={month}
        />
        {/* Last, and after a gap: it is the one that takes a caixinha out
              of the projections. */}
        <div className="mt-1 border-t border-zinc-100 pt-1">
          <ArchiveBucket bucket={bucket} />
        </div>
      </>
    </Disclosure>
  );
}
