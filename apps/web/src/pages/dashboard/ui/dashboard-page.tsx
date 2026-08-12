import type { CyclePosition, DashboardResponse } from '@fin/contracts';
import { useEffect } from 'react';

import { useBuckets } from '@/entities/bucket';
import { useDashboard } from '@/entities/dashboard';
import { useSelectedCycle } from '@/features/navigate-cycle';
import { formatDate } from '@/shared/lib';
import {
  Amount,
  Card,
  CardTitle,
  EmptyState,
  Skeleton,
  StatTile,
} from '@/shared/ui';
import { AlertList } from '@/widgets/alert-list';
import { AppShell } from '@/widgets/app-shell';
import { UpcomingList } from '@/widgets/upcoming-list';

/**
 * UC-4 — the screen that justifies the whole payday-cycle model.
 *
 * It opens on the current cycle and speaks about the next: the question is
 * always asked from the middle of the cycle you are in.
 */
export function DashboardPage() {
  const { cycles, selected, selectedMonth, isExplicit, select } =
    useSelectedCycle();
  const next = cycles.find((cycle) => cycle.position === 'next');

  // The screen is about the next cycle unless the user has said otherwise, so
  // it defaults there rather than to the current one. The default is written
  // back to the URL so the header's navigation shows the cycle on screen —
  // the two disagreeing is the bug this replaced.
  const month = isExplicit ? selectedMonth : (next?.month ?? selectedMonth);

  useEffect(() => {
    if (!isExplicit && next !== undefined) {
      select(next.month);
    }
  }, [isExplicit, next, select]);

  const { data, isPending, isError } = useDashboard(month);

  return (
    <AppShell
      title="Dashboard"
      subtitle="How much you will pay next cycle, and what survives to the next payday"
    >
      {isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : isError ? (
        <EmptyState
          title="The dashboard could not be built"
          body="Check that the API is running."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <Headline data={data} position={selected?.position} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {data.kpis.map((kpi) => (
              <StatTile
                key={kpi.label}
                label={kpi.label}
                cents={kpi.amount}
                note={kpi.note}
              />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="flex flex-col gap-4 xl:col-span-2">
              <UpcomingList entries={data.upcoming} />
              <AlertList alerts={data.alerts} />
            </div>
            <div className="flex flex-col gap-4">
              <Progress data={data} />
              <BucketChips />
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

/** How the cycle on screen relates to today, since it is no longer always next. */
const eyebrows: Record<CyclePosition, string> = {
  past: 'Past cycle',
  current: 'This cycle',
  next: 'Next cycle',
  projected: 'Projected cycle',
};

/** UC-4.1 — the answer as one sentence, and the three numbers qualifying it. */
function Headline({
  data,
  position,
}: {
  data: DashboardResponse;
  position: CyclePosition | undefined;
}) {
  const { headline } = data;

  return (
    <section className="flex flex-col gap-4 rounded-xl bg-zinc-900 p-6 text-zinc-50">
      <div className="flex items-center gap-2 text-[10px] font-semibold tracking-widest text-zinc-400 uppercase">
        {position === undefined ? 'Cycle' : eyebrows[position]}
        <span className="font-mono text-xs normal-case">{headline.range}</span>
      </div>

      <p className="max-w-4xl text-2xl leading-snug font-normal">
        In the {headline.cycleLabel} cycle you&rsquo;ll receive{' '}
        <strong className="font-mono font-semibold">
          {formatSigned(headline.incoming)}
        </strong>
        , pay{' '}
        <strong className="font-mono font-semibold text-red-300">
          {formatSigned(headline.outgoing)}
        </strong>
        , and{' '}
        <strong className="font-mono font-semibold text-green-300">
          {formatSigned(headline.free)}
        </strong>{' '}
        stays free after allocations.
      </p>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-zinc-800 pt-3 text-xs">
        <Qualifier
          label="Lowest point"
          value={headline.lowestPoint}
          note={
            headline.lowestPointDate === null
              ? 'nothing scheduled'
              : `on ${formatDate(headline.lowestPointDate)}`
          }
        />
        <Qualifier label="Closes at" value={headline.closing} />
        {/* Never let a guess masquerade as a fact. */}
        <Qualifier
          label="Without the estimates"
          value={headline.closingWithoutEstimates}
          tone="text-amber-300"
        />
      </div>
    </section>
  );
}

function Qualifier({
  label,
  value,
  note,
  tone = 'text-zinc-50',
}: {
  label: string;
  value: number | null;
  note?: string;
  tone?: string;
}) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="text-zinc-400">{label}</span>
      <span className={`font-mono text-sm font-medium ${tone}`}>
        {value === null ? '—' : formatSigned(value)}
      </span>
      {note !== undefined && <span className="text-zinc-500">{note}</span>}
    </span>
  );
}

/** UC-4.3 — two progress readings; the gap between them is the signal. */
function Progress({ data }: { data: DashboardResponse }) {
  const { progress } = data;

  return (
    <Card className="flex flex-col gap-3">
      <CardTitle>This cycle so far</CardTitle>
      <Bar
        label={`Day ${String(progress.dayOfCycle)} of ${String(progress.cycleLength)}`}
        percent={progress.timePercent}
        tone="bg-zinc-900"
      />
      <Bar
        label="Spent against planned"
        percent={progress.spentPercent}
        tone={
          progress.spentPercent > progress.timePercent
            ? 'bg-red-600'
            : 'bg-green-600'
        }
      />
      <p className="text-xs text-zinc-500">
        <Amount cents={progress.spent} /> of{' '}
        <Amount cents={progress.plannedOut} /> planned.
      </p>
    </Card>
  );
}

function Bar({
  label,
  percent,
  tone,
}: {
  label: string;
  percent: number;
  tone: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs">
        <span className="text-zinc-600">{label}</span>
        <span className="font-mono text-zinc-500">{percent}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
        <div
          className={`h-full rounded-full ${tone}`}
          style={{ width: `${String(Math.min(100, percent))}%` }}
        />
      </div>
    </div>
  );
}

/** UC-4.6 — each bucket as a compact chip, one click through to UC-6. */
function BucketChips() {
  const { data } = useBuckets();
  const buckets = (data ?? []).filter((bucket) => bucket.status === 'ACTIVE');

  if (buckets.length === 0) {
    return null;
  }

  return (
    <Card className="flex flex-col gap-3">
      <CardTitle>Buckets</CardTitle>
      {buckets.map((bucket) => (
        <div key={bucket.id} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between text-sm">
            <span>{bucket.name}</span>
            <Amount cents={bucket.balance} className="text-xs" />
          </div>
          {/* A goal shows progress; an ongoing bucket has nothing to complete. */}
          {bucket.percentComplete === null ? (
            <span className="text-xs text-zinc-500">
              ongoing — no target to hit
            </span>
          ) : (
            <>
              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-teal-600"
                  style={{ width: `${String(bucket.percentComplete)}%` }}
                />
              </div>
              <span className="text-xs text-zinc-500">
                {bucket.percentComplete}% of{' '}
                {bucket.target === null ? (
                  '—'
                ) : (
                  <Amount cents={bucket.target} />
                )}
              </span>
            </>
          )}
        </div>
      ))}
    </Card>
  );
}

/**
 * The headline reads as prose, so amounts appear without a leading minus —
 * "pay R$ 9.110" rather than "pay −R$ 9.110". The direction is in the verb.
 */
function formatSigned(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Math.abs(cents) / 100);
}
