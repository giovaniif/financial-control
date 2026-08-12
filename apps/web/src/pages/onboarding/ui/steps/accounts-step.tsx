import { useAccounts } from '@/entities/account';
import { ManageAccounts } from '@/features/manage-accounts';
import { Amount, Badge, EmptyState, Skeleton } from '@/shared/ui';

/** UC-1.2 — the accounts total is where every cycle's balance chain starts. */
export function AccountsStep() {
  const { data, isPending } = useAccounts();
  const accounts = data?.accounts ?? [];

  return (
    <div className="flex flex-col gap-6">
      <p className="text-zinc-600">
        Every projection starts from cash you actually have. Add the accounts
        you keep money in — their total is the opening balance the ledger builds
        on, and it stays visible in the sidebar as{' '}
        <em>&ldquo;In accounts now&rdquo;</em>.
      </p>

      {isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : accounts.length === 0 ? (
        <EmptyState
          title="No accounts yet"
          body="Add at least one. A credit card is paid from an account, so the cards step needs one to exist."
        />
      ) : (
        <ul className="divide-y divide-zinc-100 text-sm">
          {accounts.map((account) => (
            <li key={account.id} className="flex items-center gap-3 py-1.5">
              <span className="flex-1">{account.name}</span>
              <Badge>{account.type.toLowerCase()}</Badge>
              <Amount cents={account.balance} className="w-28 text-right" />
            </li>
          ))}
          <li className="flex items-center gap-3 pt-2 font-semibold">
            <span className="flex-1">In accounts now</span>
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
