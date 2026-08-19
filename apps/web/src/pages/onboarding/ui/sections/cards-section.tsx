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
          A card invoice is one outcome in the cycle containing its{' '}
          <strong className="font-medium text-zinc-900">due date</strong> — not
          the cycle its purchases were made in.
        </p>
        <p>
          A purchase made the day before the card closes is paid next month. One
          made the day after waits for the invoice after that:{' '}
          <strong className="font-medium text-zinc-900">
            a day apart on the calendar, a whole cycle apart in cash
          </strong>
          . That is why the closing and due days matter more than they look.
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
                closes {card.closingDay} · due {card.dueDay}
              </Badge>
              <Amount cents={card.limit} className="w-28 text-right" />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">
          No cards yet. Skip this step if you do not use one.
        </p>
      )}

      <div>
        <AddCardButton accounts={accounts.data?.accounts ?? []} />
      </div>
    </div>
  );
}
