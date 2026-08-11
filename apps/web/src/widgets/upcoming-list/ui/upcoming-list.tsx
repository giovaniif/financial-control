import type { UpcomingEntryResponse } from '@fin/contracts';

import { SettleButton } from '@/features/settle-entry';
import { formatDayMonth } from '@/shared/lib';
import { Amount, Badge, CardTitle, EmptyState } from '@/shared/ui';

/**
 * UC-4.5 — the next obligations, each settleable inline. This is the fastest
 * path to settling something, which is why it sits on the landing screen.
 */
export function UpcomingList({
  entries,
}: {
  entries: UpcomingEntryResponse[];
}) {
  return (
    <section className="flex flex-col gap-2">
      <CardTitle>Upcoming</CardTitle>
      {entries.length === 0 ? (
        <EmptyState
          title="Nothing due"
          body="Every entry in the next cycles is settled."
        />
      ) : (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center gap-3 px-4 py-2.5 text-sm"
            >
              <span
                className={`w-16 shrink-0 font-mono text-xs ${
                  entry.isOverdue
                    ? 'font-semibold text-red-700'
                    : 'text-zinc-500'
                }`}
              >
                {formatDayMonth(entry.dueDate)}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {entry.description}
              </span>
              {entry.isEstimate && <Badge tone="warning">~estimate</Badge>}
              {entry.isOverdue && (
                <Badge tone="critical">
                  {entry.daysLate} day{entry.daysLate === 1 ? '' : 's'} late
                </Badge>
              )}
              <Amount cents={entry.amount} signed className="w-28 text-right" />
              <SettleButton
                month={entry.cycleMonth}
                entryId={entry.id}
                isIncoming={entry.amount > 0}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
