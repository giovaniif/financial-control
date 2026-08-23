import type { CardResponse } from '@fin/contracts';

import { useAccounts } from '@/entities/account';
import { useCards } from '@/entities/card';
import { AddCardButton } from '@/features/configure-card';
import { Amount, Card, CardTitle, EmptyState, Skeleton } from '@/shared/ui';

/**
 * UC-1.3 and UC-5.8 — the closing/due day pair that decides which cycle a
 * purchase is paid from, and what is already committed to future invoices.
 * Purchases themselves are registered by asking (UC-8.3), not here.
 */
export function CardsSection() {
  const { data, isPending } = useCards();
  const { data: accounts } = useAccounts();
  const cards = data ?? [];

  if (isPending) {
    return <Skeleton className="h-32 w-full" />;
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <CardTitle>Credit cards</CardTitle>
        <AddCardButton accounts={accounts?.accounts ?? []} />
      </div>

      {cards.length === 0 ? (
        <EmptyState
          title="No cards yet"
          body="A card needs a limit, a closing day and a due day. Those two days decide which cycle a purchase is paid from."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <CardSummary key={card.id} card={card} />
          ))}
        </div>
      )}
    </section>
  );
}

function CardSummary({ card }: { card: CardResponse }) {
  return (
    <Card className="flex flex-col gap-2">
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
    </Card>
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
