import type { LedgerEntryResponse } from '@fin/contracts';

import { useCycle } from '@/entities/cycle';
import { AddEntryButton } from '@/features/add-entry';
import { CloseCycle } from '@/features/close-cycle';
import { useSelectedCycle } from '@/features/navigate-cycle';
import { OverrideEntry } from '@/features/override-entry';
import { SettleEntry } from '@/features/settle-entry';
import { formatDate } from '@/shared/lib';
import { Amount, Badge, CardTitle, EmptyState, Skeleton } from '@/shared/ui';
import { AppShell } from '@/widgets/app-shell';
import { ChainStrip } from '@/widgets/chain-strip';

const kindTones = {
  INCOME: 'positive',
  FIXED: 'neutral',
  INVOICE: 'info',
  VARIABLE: 'neutral',
  ALLOCATION: 'info',
} as const;

const statusTones = {
  PAID: 'positive',
  RECEIVED: 'positive',
  OVERDUE: 'critical',
  SKIPPED: 'neutral',
  PENDING: 'neutral',
} as const;

/** UC-3 — one cycle in full, in due-date order, with a running balance. */
export function LedgerPage() {
  const { selectedMonth, selected } = useSelectedCycle();
  const { data, isPending } = useCycle(selectedMonth);

  return (
    <AppShell
      title="Cycle Ledger"
      subtitle="Every entry in one cycle, in due-date order, with the balance after each"
    >
      {isPending || data === undefined ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="flex flex-col gap-4">
          <ChainStrip
            chain={data.chain}
            openingFrom="carried in from the previous cycle"
          />

          {data.firstNegativeDate !== null && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800"
            >
              The balance goes negative on {formatDate(data.firstNegativeDate)}.
            </p>
          )}

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4">
              <CardTitle>
                {data.label} · {data.entries.length} entries
              </CardTitle>
              <div className="flex items-center gap-2">
                {/* A closed cycle is read-only, so it offers no action but
                    the one that reopens it. */}
                {data.status === 'OPEN' && (
                  <AddEntryButton
                    month={data.month}
                    start={data.start}
                    end={data.end}
                  />
                )}
                <CloseCycle
                  month={data.month}
                  label={data.label}
                  status={data.status}
                  hasEnded={selected?.position === 'past'}
                  unsettled={unsettledCount(data.entries)}
                />
              </div>
            </div>
            {data.entries.length === 0 ? (
              <EmptyState
                title="Nothing in this cycle yet"
                body="Recurring templates fill future cycles. Add one, or add a one-off entry here."
              />
            ) : (
              <Table
                month={data.month}
                entries={data.entries}
                isOpen={data.status === 'OPEN'}
              />
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}

function Table({
  month,
  entries,
  isOpen,
}: {
  month: string;
  entries: LedgerEntryResponse[];
  isOpen: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-[10px] tracking-wider text-zinc-500 uppercase">
            <th className="px-4 py-2 font-semibold">Date</th>
            <th className="px-4 py-2 font-semibold">Description</th>
            <th className="px-4 py-2 text-right font-semibold">Planned</th>
            <th className="px-4 py-2 text-right font-semibold">Actual</th>
            <th className="px-4 py-2 text-right font-semibold">Balance</th>
            <th className="px-4 py-2 font-semibold">Status</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {entries.map((entry) => (
            <tr key={entry.id} className="hover:bg-zinc-50">
              <td className="px-4 py-2 font-mono text-xs whitespace-nowrap text-zinc-500">
                {formatDate(entry.dueDate)}
              </td>
              <td className="px-4 py-2">
                <span className="flex items-center gap-2">
                  {entry.description}
                  <Badge tone={kindTones[entry.kind]}>{entry.kind}</Badge>
                  {entry.isEstimate && <Badge tone="warning">~estimate</Badge>}
                  {entry.isOverridden && <Badge tone="info">overridden</Badge>}
                </span>
              </td>
              <td className="px-4 py-2 text-right">
                <Amount cents={entry.planned} signed />
              </td>
              <td className="px-4 py-2 text-right">
                {entry.actual === null ? (
                  <span className="text-zinc-300">—</span>
                ) : (
                  <Amount cents={entry.actual} signed />
                )}
              </td>
              {/* What makes the ledger answer "when", not just "how much". */}
              <td className="px-4 py-2 text-right">
                <Amount cents={entry.balance} />
              </td>
              <td className="px-4 py-2">
                <Badge tone={statusTones[entry.status]}>{entry.status}</Badge>
              </td>
              <td className="px-4 py-2">
                {isOpen &&
                (entry.status === 'PENDING' || entry.status === 'OVERDUE') ? (
                  <span className="flex items-center justify-end gap-1">
                    <OverrideEntry
                      month={month}
                      entryId={entry.id}
                      planned={entry.planned}
                      isOverridden={entry.isOverridden}
                    />
                    <SettleEntry
                      month={month}
                      entryId={entry.id}
                      planned={entry.planned}
                    />
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A cycle cannot close while any entry is still waiting to become a fact. */
function unsettledCount(entries: LedgerEntryResponse[]): number {
  return entries.filter(
    (entry) => entry.status === 'PENDING' || entry.status === 'OVERDUE',
  ).length;
}
