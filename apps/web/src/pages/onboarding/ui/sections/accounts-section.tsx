import type { AccountType } from '@fin/contracts';

import { useAccounts } from '@/entities/account';
import { ManageAccounts } from '@/features/manage-accounts';
import { Amount, Badge, EmptyState, Skeleton } from '@/shared/ui';

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  CHECKING: 'corrente',
  SAVINGS: 'poupança',
  CASH: 'dinheiro',
};

/** UC-1.2 — the accounts total is where every cycle's balance chain starts. */
export function AccountsSection() {
  const { data, isPending } = useAccounts();
  const accounts = data?.accounts ?? [];

  return (
    <div className="flex flex-col gap-6">
      <p className="text-zinc-600">
        Toda projeção começa a partir do dinheiro que você realmente tem.
        Adicione as contas onde você mantém dinheiro — o total delas é o saldo
        inicial em que o extrato se baseia, e continua visível na barra lateral
        como <em>&ldquo;Nas contas agora&rdquo;</em>.
      </p>

      {isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : accounts.length === 0 ? (
        <EmptyState
          title="Nenhuma conta ainda"
          body="Adicione pelo menos uma. Um cartão de crédito é pago a partir de uma conta, então a etapa dos cartões precisa que uma exista."
        />
      ) : (
        <ul className="divide-y divide-zinc-100 text-sm">
          {accounts.map((account) => (
            <li key={account.id} className="flex items-center gap-3 py-1.5">
              <span className="flex-1">{account.name}</span>
              <Badge>{ACCOUNT_TYPE_LABELS[account.type]}</Badge>
              <Amount cents={account.balance} className="w-28 text-right" />
            </li>
          ))}
          <li className="flex items-center gap-3 pt-2 font-semibold">
            <span className="flex-1">Nas contas agora</span>
            <Amount cents={data?.total ?? 0} className="w-28 text-right" />
          </li>
        </ul>
      )}

      <div>
        <ManageAccounts accounts={accounts} />
      </div>
    </div>
  );
}
