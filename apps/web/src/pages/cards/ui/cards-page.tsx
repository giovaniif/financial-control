import type { CardResponse } from '@fin/contracts';
import { useState } from 'react';

import { useAccounts } from '@/entities/account';
import { useCards } from '@/entities/card';
import { AddCardButton } from '@/features/configure-card';
import { PayInvoice, PayOffEarly } from '@/features/pay-invoice';
import { RegisterPurchaseButton } from '@/features/register-purchase';
import { formatDate, formatRange } from '@/shared/lib';
import {
  Amount,
  Badge,
  Card,
  CardTitle,
  EmptyState,
  Skeleton,
} from '@/shared/ui';
import { AppShell } from '@/widgets/app-shell';

const statusTones = {
  OPEN: 'info',
  CLOSED: 'neutral',
  PAID: 'positive',
} as const;

/** UC-5 — cards, their invoices, and the cycles that pay them. */
export function CardsPage() {
  const { data, isPending } = useCards();
  const { data: accounts } = useAccounts();
  const [selectedId, setSelectedId] = useState<string>();
  const cards = data ?? [];
  const selected = cards.find((card) => card.id === selectedId) ?? cards[0];

  return (
    <AppShell
      title="Cards & Invoices"
      subtitle="What is already committed, and which cycle each invoice is paid from"
    >
      {isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : cards.length === 0 ? (
        <div className="flex flex-col items-center gap-3">
          <EmptyState
            title="No cards yet"
            body="A card needs a limit, a closing day and a due day. Those two days decide which cycle a purchase is paid from."
          />
          <AddCardButton accounts={accounts?.accounts ?? []} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => {
                  setSelectedId(card.id);
                }}
                className={`cursor-pointer rounded-xl border bg-white p-4 text-left transition-colors ${
                  card.id === selected?.id
                    ? 'border-zinc-900'
                    : 'border-zinc-200 hover:border-zinc-300'
                }`}
              >
                <CardSummary card={card} />
              </button>
            ))}
          </div>

          {selected !== undefined && (
            <>
              <div className="flex justify-end gap-2">
                <AddCardButton accounts={accounts?.accounts ?? []} />
                <RegisterPurchaseButton
                  cardId={selected.id}
                  cardName={selected.name}
                />
              </div>
              <Invoices card={selected} />
            </>
          )}
        </div>
      )}
    </AppShell>
  );
}

function CardSummary({ card }: { card: CardResponse }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="font-medium">{card.name}</span>
        <span className="font-mono text-xs text-zinc-500">
          closes {card.closingDay} · due {card.dueDay}
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-xs">
        <Figure label="Limit" cents={card.limit} />
        {/* The figure the spreadsheet could not produce. */}
        <Figure label="Committed" cents={card.committedToFuture} />
        <Figure label="Available" cents={card.available} />
      </dl>
    </div>
  );
}

function Figure({ label, cents }: { label: string; cents: number }) {
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

function Invoices({ card }: { card: CardResponse }) {
  if (card.invoices.length === 0) {
    return (
      <EmptyState
        title={`No invoices on ${card.name} yet`}
        body="Register a purchase and the invoice it belongs to opens itself."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <CardTitle>{card.name} invoices</CardTitle>
      {card.invoices.map((invoice) => (
        <Card key={invoice.id} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="text-sm font-medium">
              Due {formatDate(invoice.dueDate)}
            </span>
            <Badge tone={statusTones[invoice.status]}>{invoice.status}</Badge>
            <span className="font-mono text-xs text-zinc-500">
              {formatRange(invoice.periodStart, invoice.periodEnd)}
            </span>
            {/* UC-5.4 — which cycle actually pays for it. */}
            <span className="text-xs text-zinc-500">
              paid in the {invoice.paidInCycle} cycle
            </span>
            <Amount
              cents={invoice.total}
              signed
              className="ml-auto text-sm font-semibold"
            />
            <PayInvoice cardId={card.id} invoice={invoice} />
          </div>

          <ul className="divide-y divide-zinc-100 text-sm">
            {invoice.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-1.5">
                <span className="w-16 shrink-0 font-mono text-xs text-zinc-500">
                  {formatDate(item.purchasedOn).slice(0, 5)}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {item.description}
                </span>
                {item.installment !== null && (
                  <Badge tone="info">{item.installment}</Badge>
                )}
                {item.isRefund && <Badge tone="positive">refund</Badge>}
                <Amount
                  cents={item.amount}
                  signed
                  className="w-28 text-right"
                />
                {/* Only a plan has anything left to anticipate. */}
                {item.installment !== null && invoice.status === 'OPEN' && (
                  <PayOffEarly
                    cardId={card.id}
                    purchaseId={item.purchaseId}
                    description={`${item.description} ${item.installment}`}
                  />
                )}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
