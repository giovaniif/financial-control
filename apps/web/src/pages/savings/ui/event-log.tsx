import type { BucketEventResponse } from '@fin/contracts';

import type { BucketView } from '@/entities/bucket';
import { formatBRL, formatDate, formatMonthLabel } from '@/shared/lib';
import { Amount, Badge, Card, CardTitle, EmptyState } from '@/shared/ui';

const tones = {
  CONTRIBUTION: 'positive',
  OVERRIDE: 'neutral',
  YIELD: 'info',
  CORRECTION: 'warning',
  WITHDRAWAL: 'critical',
} as const;

const MONTH_KEY_LENGTH = 7;

/**
 * UC-6.7 — the append-only log. The spreadsheet overwrote its own running
 * total whenever reality drifted, leaving no trace of why, and could not tell
 * a deposit from accrued interest. Each of the five kinds says which it is.
 */
export function EventLog({ bucket }: { bucket: BucketView }) {
  return (
    <Card label="History" className="flex flex-col gap-3">
      <CardTitle>{bucket.name} — history</CardTitle>
      {bucket.events.length === 0 ? (
        <EmptyState
          title="Nothing has moved yet"
          body="Contributions land when a cycle is allocated. Yields and corrections are recorded by hand."
        />
      ) : (
        <ul className="divide-y divide-zinc-100 text-sm">
          {[...bucket.events].reverse().map((event) => (
            <li key={event.id} className="flex items-center gap-3 py-2">
              <span className="w-28 shrink-0 font-mono text-xs text-zinc-500">
                {formatWhen(event.when)}
              </span>
              <Badge tone={tones[event.kind]}>{event.kind.toLowerCase()}</Badge>
              <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">
                {noteFor(event)}
              </span>
              <Amount cents={event.amount} className="w-28 text-right" />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** A contribution and an override belong to a cycle; the rest to a day. */
function formatWhen(when: string): string {
  return when.length === MONTH_KEY_LENGTH
    ? formatMonthLabel(when)
    : formatDate(when);
}

function noteFor(event: BucketEventResponse): string {
  switch (event.kind) {
    case 'CONTRIBUTION':
      return `the rule applied for ${formatMonthLabel(event.when)}`;
    case 'OVERRIDE':
      return event.ruleWouldHaveBeen === null
        ? 'a deliberate amount for this cycle only'
        : `deliberate, for this cycle only — the rule would have said ${formatBRL(event.ruleWouldHaveBeen)}`;
    case 'YIELD':
      return 'growth from returns, not a deposit';
    case 'CORRECTION':
      return event.reason ?? '';
    case 'WITHDRAWAL':
      return event.reason ?? '';
    default: {
      const unhandled: never = event.kind;

      return unhandled;
    }
  }
}
