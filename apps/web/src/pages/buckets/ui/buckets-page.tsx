import type { BucketResponse } from '@fin/contracts';
import { useState } from 'react';

import { useBuckets } from '@/entities/bucket';
import {
  AdjustRule,
  ArchiveBucket,
  RecordEvent,
} from '@/features/manage-buckets';
import { useSelectedCycle } from '@/features/navigate-cycle';
import { formatDate } from '@/shared/lib';
import {
  Amount,
  Badge,
  Card,
  CardTitle,
  EmptyState,
  Skeleton,
} from '@/shared/ui';
import { AppShell } from '@/widgets/app-shell';

const eventTones = {
  CONTRIBUTION: 'positive',
  OVERRIDE: 'info',
  YIELD: 'info',
  CORRECTION: 'warning',
  WITHDRAWAL: 'critical',
} as const;

/** UC-6 — a pot of savings fed by a rule each cycle. */
export function BucketsPage() {
  const { data, isPending } = useBuckets();
  const { selectedMonth } = useSelectedCycle();
  const [selectedId, setSelectedId] = useState<string>();
  const buckets = data ?? [];
  const selected = buckets.find((b) => b.id === selectedId) ?? buckets[0];

  return (
    <AppShell
      title="Buckets & Goals"
      subtitle="Where the surplus goes, and how far along each pot is"
    >
      {isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : buckets.length === 0 ? (
        <EmptyState
          title="No buckets yet"
          body="A bucket is either a goal with a target and a date, or an ongoing amount with nothing to complete."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {buckets.map((bucket) => (
              <button
                key={bucket.id}
                type="button"
                onClick={() => {
                  setSelectedId(bucket.id);
                }}
                className={`cursor-pointer rounded-xl border bg-white p-4 text-left transition-colors ${
                  bucket.id === selected?.id
                    ? 'border-zinc-900'
                    : 'border-zinc-200 hover:border-zinc-300'
                } ${bucket.status === 'ARCHIVED' ? 'opacity-55' : ''}`}
              >
                <BucketSummary bucket={bucket} />
              </button>
            ))}
          </div>

          {selected !== undefined && (
            <>
              <div className="flex justify-end gap-2">
                <AdjustRule bucket={selected} month={selectedMonth ?? ''} />
                <RecordEvent
                  bucketId={selected.id}
                  bucketName={selected.name}
                  month={selectedMonth ?? ''}
                />
                <ArchiveBucket bucket={selected} />
              </div>
              <EventLog bucket={selected} />
            </>
          )}
        </div>
      )}
    </AppShell>
  );
}

function BucketSummary({ bucket }: { bucket: BucketResponse }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="font-medium">{bucket.name}</span>
        <Badge tone={bucket.mode === 'GOAL' ? 'positive' : 'info'}>
          {bucket.status === 'ARCHIVED'
            ? 'archived'
            : bucket.mode.toLowerCase()}
        </Badge>
        <Amount
          cents={bucket.balance}
          className="ml-auto text-sm font-semibold"
        />
      </div>

      {/* A goal shows progress; an ongoing bucket has no finish line. */}
      {bucket.percentComplete === null ? (
        <p className="text-xs text-zinc-500">
          {bucket.rule.kind === 'FIXED' ? (
            <>
              <Amount cents={bucket.rule.amount} className="text-xs" /> per
              cycle
            </>
          ) : (
            `${String(bucket.rule.percent)} % of Expected Surplus`
          )}{' '}
          — no target to hit, the question is whether the rate is right.
        </p>
      ) : (
        <>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full rounded-full bg-teal-600"
              style={{ width: `${String(bucket.percentComplete)}%` }}
            />
          </div>
          <p className="text-xs text-zinc-500">
            {bucket.percentComplete}% of{' '}
            {bucket.target === null ? (
              '—'
            ) : (
              <Amount cents={bucket.target} className="text-xs" />
            )}
            {bucket.targetDate !== null &&
              ` by ${formatDate(bucket.targetDate)}`}
          </p>
        </>
      )}

      <p className="text-xs text-zinc-400">
        saved <Amount cents={bucket.contributed} className="text-xs" /> · earned{' '}
        <Amount cents={bucket.yielded} className="text-xs" />
      </p>
    </div>
  );
}

/**
 * UC-6.7 — the append-only log. The spreadsheet overwrote its own running
 * total whenever reality drifted; here every change says what it was and why.
 */
function EventLog({ bucket }: { bucket: BucketResponse }) {
  return (
    <div className="flex flex-col gap-2">
      <CardTitle>{bucket.name} — history</CardTitle>
      {bucket.events.length === 0 ? (
        <EmptyState
          title="Nothing has moved yet"
          body="Contributions land when a cycle is allocated. Yields and corrections are recorded by hand."
        />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-zinc-100 text-sm">
            {[...bucket.events].reverse().map((event) => (
              <li key={event.id} className="flex items-center gap-3 px-4 py-2">
                <span className="w-24 shrink-0 font-mono text-xs text-zinc-500">
                  {event.when.length === 7
                    ? event.when
                    : formatDate(event.when)}
                </span>
                <Badge tone={eventTones[event.kind]}>
                  {event.kind.toLowerCase()}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">
                  {event.reason ??
                    (event.ruleWouldHaveBeen === null
                      ? ''
                      : `the rule said ${String(event.ruleWouldHaveBeen / 100)}`)}
                </span>
                <Amount cents={event.amount} className="w-28 text-right" />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
