import type { UpcomingEntryResponse } from '@fin/contracts';

import { SettleEntry } from '@/features/settle-entry';
import { formatDayMonth } from '@/shared/lib';
import { Amount, Badge, CardTitle, EmptyState } from '@/shared/ui';

/**
 * UC-4.5 — the next obligations, each settleable inline. With the Ledger
 * screen gone this is the only place an entry is settled by hand, so it
 * carries UC-3.5 in full: one click when the actual equals the planned
 * amount, two when it does not.
 */
export function UpcomingList({
  entries,
}: {
  entries: UpcomingEntryResponse[];
}) {
  return (
    <section className="flex flex-col gap-2">
      <CardTitle>A vencer</CardTitle>
      {entries.length === 0 ? (
        <EmptyState
          title="Nada a vencer"
          body="Todos os lançamentos dos próximos ciclos já foram baixados."
        />
      ) : (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:gap-3 sm:py-2.5"
            >
              {/* What it is and what it costs — the two things the row exists
                  to say, kept on one line at every width. */}
              <div className="flex min-w-0 items-center gap-3 sm:flex-1">
                <span
                  className={`w-14 shrink-0 font-mono text-xs sm:w-16 ${
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
                <Amount
                  cents={entry.amount}
                  signed
                  className="shrink-0 text-right sm:w-28"
                />
              </div>

              {/* Tags and the settle action drop to a second line on a phone
                  rather than squeezing the description out of the first. */}
              <div className="flex items-center gap-2 self-end sm:self-auto">
                {entry.isEstimate && <Badge tone="warning">~estimativa</Badge>}
                {entry.isOverdue && (
                  <Badge tone="critical">
                    {entry.daysLate} dia{entry.daysLate === 1 ? '' : 's'} de
                    atraso
                  </Badge>
                )}
                <SettleEntry
                  month={entry.cycleMonth}
                  entryId={entry.id}
                  planned={entry.amount}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
