import type { CardResponse, Cents, InvoiceResponse } from '@fin/contracts';

import { formatDayMonth, formatMonthLabel } from '@/shared/lib';
import { Amount, Card } from '@/shared/ui';

/** UC-1.3 and UC-5.8 — the day pair, said in dates, and what it already costs. */
export function CardSummary({ card }: { card: CardResponse }) {
  const open = card.invoices.find((invoice) => invoice.status === 'OPEN');

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="font-medium">{card.name}</span>
        <span className="font-mono text-xs text-zinc-500">
          closes {card.closingDay} · due {card.dueDay}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-xs">
        <Figure label="Limit" cents={card.limit} />
        <Figure label="Open invoice" cents={open?.total ?? 0} />
        {/* The figure the spreadsheet could not produce. */}
        <Figure label="Committed" cents={card.committedToFuture} />
        <Figure label="Available" cents={card.available} />
      </dl>

      <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
        {open === undefined ? withoutInvoice(card) : billing(open)}
      </p>
    </Card>
  );
}

/**
 * An invoice is paid in the cycle containing its DUE date, not the one its
 * purchases were made in — a purchase one day after closing shifts a whole
 * cycle. See UC-5.4.
 */
function billing(invoice: InvoiceResponse): string {
  return `Purchases from ${formatDayMonth(invoice.periodStart)} to ${formatDayMonth(
    invoice.periodEnd,
  )} will be billed on the invoice due ${formatDayMonth(
    invoice.dueDate,
  )} — the ${formatMonthLabel(invoice.paidInCycle)} cycle.`;
}

/** Nothing has been bought yet, so there are no dates to name — only the rule. */
function withoutInvoice(card: CardResponse): string {
  return `Purchases up to day ${String(card.closingDay)} are billed on the invoice due day ${String(
    card.dueDay,
  )} of the following month. A purchase one day later waits for the invoice after that — an entire cycle later in cash terms.`;
}

function Figure({ label, cents }: { label: string; cents: Cents }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] tracking-wide text-zinc-400 uppercase">
        {label}
      </dt>
      <dd>
        <Amount cents={cents} className="text-xs" />
      </dd>
    </div>
  );
}
