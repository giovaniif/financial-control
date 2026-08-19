import { useAccounts } from '@/entities/account';
import { useCards } from '@/entities/card';
import { AddCardButton } from '@/features/configure-card';
import { CardTitle, EmptyState, Skeleton } from '@/shared/ui';

import { CardSummary } from './card-summary.js';

/**
 * UC-1.3 and UC-5.8 — the closing/due day pair that decides which cycle a
 * purchase is paid from, and what is already committed to future invoices.
 * Purchases themselves are registered by asking, not here.
 */
export function CardsSection() {
  const { data, isPending } = useCards();
  const { data: accounts } = useAccounts();
  const cards = data ?? [];

  if (isPending) {
    return <Skeleton className="h-32 w-full" />;
  }

  return (
    <section aria-label="Cartões de crédito" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <CardTitle>Cartões de crédito</CardTitle>
          <p className="text-xs text-zinc-500">
            Os dias de fechamento e vencimento decidem em qual ciclo uma compra
            é paga.
          </p>
        </div>
        <AddCardButton accounts={accounts?.accounts ?? []} />
      </div>

      {cards.length === 0 ? (
        <EmptyState
          title="Nenhum cartão ainda"
          body="Um cartão precisa de um limite, um dia de fechamento e um dia de vencimento. Esses dois dias decidem em qual ciclo uma compra é paga."
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
