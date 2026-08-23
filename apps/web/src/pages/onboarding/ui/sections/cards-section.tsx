import { useAccounts } from '@/entities/account';
import { useCards } from '@/entities/card';
import { AddCardButton } from '@/features/configure-card';
import { Amount, Badge, Skeleton } from '@/shared/ui';

/**
 * UC-1.3 / UC-5.4 — the closing and due day pair is what decides which cycle
 * a purchase is actually paid from, and it is the app's one genuinely
 * counter-intuitive rule.
 */
export function CardsSection() {
  const accounts = useAccounts();
  const { data: cards, isPending } = useCards();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 text-zinc-600">
        <p>
          Uma fatura de cartão é uma única saída no ciclo que contém o seu{' '}
          <strong className="font-medium text-zinc-900">vencimento</strong> —
          não o ciclo em que as compras foram feitas.
        </p>
        <p>
          Uma compra feita no dia antes do fechamento do cartão é paga no mês
          seguinte. Uma feita no dia depois espera pela fatura seguinte a essa:{' '}
          <strong className="font-medium text-zinc-900">
            um dia de diferença no calendário, um ciclo inteiro de diferença no
            caixa
          </strong>
          . É por isso que os dias de fechamento e vencimento importam mais do
          que parecem.
        </p>
      </div>

      {isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : cards !== undefined && cards.length > 0 ? (
        <ul className="divide-y divide-zinc-100 text-sm">
          {cards.map((card) => (
            <li key={card.id} className="flex items-center gap-3 py-1.5">
              <span className="flex-1">{card.name}</span>
              <Badge>
                fecha {card.closingDay} · vence {card.dueDay}
              </Badge>
              <Amount cents={card.limit} className="w-28 text-right" />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">
          Nenhum cartão ainda. Pule esta etapa se você não usa um.
        </p>
      )}

      <div>
        <AddCardButton accounts={accounts.data?.accounts ?? []} />
      </div>
    </div>
  );
}
