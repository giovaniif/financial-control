import type { AccountType } from '@fin/contracts';

import { useAccounts } from '@/entities/account';
import { ManageAccounts } from '@/features/manage-accounts';
import { Amount, Badge, Card, CardTitle, Skeleton } from '@/shared/ui';

const typeLabels: Record<AccountType, string> = {
  CHECKING: 'corrente',
  SAVINGS: 'poupança',
  CASH: 'dinheiro',
};

/** UC-1.2 — the accounts whose total is the app's starting cash. */
export function AccountsSection() {
  const { data, isPending } = useAccounts();

  return (
    <Card label="Contas" className="flex flex-col gap-3">
      <CardTitle>Contas</CardTitle>
      {isPending || data === undefined ? (
        <Skeleton className="h-16 w-full" />
      ) : data.accounts.length === 0 ? (
        <>
          <p className="text-sm text-zinc-500">
            Nenhuma conta ainda. O total delas é o saldo inicial do app.
          </p>
          <ManageAccounts accounts={[]} />
        </>
      ) : (
        <>
          <ul className="divide-y divide-zinc-100 text-sm">
            {data.accounts.map((account) => (
              <li key={account.id} className="flex items-center gap-3 py-1.5">
                <span className="flex-1">{account.name}</span>
                <Badge>{typeLabels[account.type]}</Badge>
                <Amount cents={account.balance} className="w-28 text-right" />
              </li>
            ))}
            <li className="flex items-center gap-3 pt-2 text-sm font-semibold">
              <span className="flex-1">Nas contas agora</span>
              <Amount cents={data.total} className="w-28 text-right" />
            </li>
          </ul>
          <ManageAccounts accounts={data.accounts} />
        </>
      )}
    </Card>
  );
}
