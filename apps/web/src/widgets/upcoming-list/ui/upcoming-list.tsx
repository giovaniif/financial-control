import type { UpcomingEntryResponse } from '@fin/contracts';

import { SettleEntry } from '@/features/settle-entry';
import { formatDayMonth } from '@/shared/lib';
import { Amount, Badge, CardTitle, EmptyState } from '@/shared/ui';

import { EntryActions } from './entry-actions.js';

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
    <section className="flex min-h-0 flex-col gap-2 lg:flex-1">
      <CardTitle>A vencer</CardTitle>
      {entries.length === 0 ? (
        <EmptyState
          title="Nada a vencer"
          body="Todos os lançamentos dos próximos ciclos já foram baixados."
        />
      ) : (
        /* From `lg` up the window is the frame, so this takes the height
           left over and scrolls inside itself — settling a bill never means
           scrolling the figures off the screen first. Below that the page
           scrolls and this grows with its content. Focusable either way, or
           the rows past the fold need a mouse (WCAG 2.1.1). */
        <ul
          role="region"
          aria-label="A vencer"
          // A scrollable region has to be focusable or its rows past the
          // fold cannot be reached without a mouse (WCAG 2.1.1). The rule
          // allows this for `tabpanel` only, and a worklist is not one.
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain"
        >
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
                {/* `info`, not `warning`: an estimate is a caveat about a
                    figure nobody confirmed, this is a figure the user changed
                    on purpose for this cycle (UC-3.7). */}
                {entry.isOverridden && <Badge tone="info">alterado</Badge>}
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
                  isEstimate={entry.isEstimate}
                />
                <EntryActions entry={entry} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
