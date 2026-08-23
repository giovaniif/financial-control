import { useState } from 'react';

import { toBucketView, useBuckets } from '@/entities/bucket';
import { CreateBucketButton } from '@/features/create-bucket';
import {
  AdjustRule,
  ArchiveBucket,
  CorrectBalance,
  RecordEvent,
} from '@/features/manage-buckets';
import { useSelectedCycle } from '@/features/navigate-cycle';
import { EmptyState, Skeleton } from '@/shared/ui';
import { AppShell } from '@/widgets/app-shell';

import { AllocationSection } from './allocation-section.js';
import { BucketsSection } from './buckets-section.js';
import { EventLog } from './event-log.js';
import { PlannedAgainstReal } from './planned-against-real.js';
import { WealthSection } from './wealth-section.js';

/**
 * UC-6 and UC-7 — the pots of savings fed by a rule each cycle, what this
 * cycle actually funds, and beneath them where that rate lands over decades.
 */
export function SavingsPage() {
  const { data, isPending } = useBuckets();
  const { selectedMonth } = useSelectedCycle();
  const [selectedId, setSelectedId] = useState<string>();
  const buckets = (data ?? []).map(toBucketView);
  const selected =
    buckets.find((bucket) => bucket.id === selectedId) ?? buckets[0];

  return (
    <AppShell
      title="Investimentos e Reservas"
      subtitle="Para onde vai a sobra, o quanto cada caixinha já avançou, e onde o ritmo leva"
    >
      {isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : buckets.length === 0 ? (
        <div className="flex flex-col items-start gap-4">
          <EmptyState
            title="Nenhuma caixinha ainda"
            body="Uma caixinha é uma meta com um valor e uma data do objetivo, ou um valor contínuo sem nada a completar."
          />
          <CreateBucketButton existingCount={0} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <BucketsSection
            buckets={buckets}
            selectedId={selected?.id}
            onSelect={setSelectedId}
          />

          {selected !== undefined && (
            <div className="flex justify-end gap-2">
              <AdjustRule bucket={selected} month={selectedMonth ?? ''} />
              <CorrectBalance
                bucketId={selected.id}
                bucketName={selected.name}
                balance={selected.balance}
              />
              <RecordEvent
                bucketId={selected.id}
                bucketName={selected.name}
                month={selectedMonth ?? ''}
              />
              <ArchiveBucket bucket={selected} />
            </div>
          )}

          {selectedMonth !== undefined && (
            <AllocationSection month={selectedMonth} />
          )}

          {selected !== undefined && (
            <>
              <PlannedAgainstReal bucket={selected} />
              <EventLog bucket={selected} />
            </>
          )}

          <WealthSection month={selectedMonth} />
        </div>
      )}
    </AppShell>
  );
}
