import type { BucketView, GoalBucket, OngoingBucket } from '@/entities/bucket';
import { formatDate, formatPercent } from '@/shared/lib';
import { Amount, Badge } from '@/shared/ui';

/**
 * UC-6.1 — one card, two readings. The mode is a union, so the goal branch is
 * the only place a target can be mentioned and the ongoing branch has no
 * progress to report even by accident.
 */
export function BucketSummary({ bucket }: { bucket: BucketView }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="font-medium">{bucket.name}</span>
        <Badge tone={bucket.mode === 'GOAL' ? 'positive' : 'info'}>
          {bucket.status === 'ARCHIVED'
            ? 'arquivada'
            : bucket.mode === 'GOAL'
              ? 'meta'
              : 'contínua'}
        </Badge>
        <Amount
          cents={bucket.balance}
          className="ml-auto text-sm font-semibold"
        />
      </div>

      {bucket.mode === 'GOAL' ? (
        <GoalProgress bucket={bucket} />
      ) : (
        <OngoingRate bucket={bucket} />
      )}

      {/* Growth from saving, never confused with growth from returns. */}
      <p className="text-xs text-zinc-400">
        aportado <Amount cents={bucket.contributed} className="text-xs" /> ·
        rendeu <Amount cents={bucket.yielded} className="text-xs" />
      </p>
    </div>
  );
}

function GoalProgress({ bucket }: { bucket: GoalBucket }) {
  return (
    <>
      <div
        role="progressbar"
        aria-label={`${bucket.name} toward its target`}
        aria-valuenow={bucket.percentComplete}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 overflow-hidden rounded-full bg-zinc-100"
      >
        <div
          className="h-full rounded-full bg-teal-600"
          style={{ width: `${String(bucket.percentComplete)}%` }}
        />
      </div>
      <p className="text-xs text-zinc-500">
        {formatPercent(bucket.percentComplete)} de{' '}
        <Amount cents={bucket.target} className="text-xs" /> até{' '}
        {formatDate(bucket.targetDate)}
      </p>
      <p className="text-xs text-zinc-500">
        <Rule rule={bucket.rule} />
      </p>
    </>
  );
}

function OngoingRate({ bucket }: { bucket: OngoingBucket }) {
  return (
    <p className="text-xs text-zinc-500">
      <Rule rule={bucket.rule} /> — sem objetivo a bater, a questão é só se o
      ritmo está certo.
    </p>
  );
}

/** UC-6.2 — what the bucket is fed, in whichever term the rule was set in. */
function Rule({ rule }: { rule: BucketView['rule'] }) {
  if (rule.kind === 'FIXED') {
    return (
      <>
        <Amount cents={rule.amount} className="text-xs" /> por ciclo
      </>
    );
  }

  return <>{formatPercent(rule.percent)} da Sobra Esperada por ciclo</>;
}
