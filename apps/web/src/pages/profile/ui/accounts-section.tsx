import { useAccounts } from '@/entities/account';
import { ManageAccounts } from '@/features/manage-accounts';
import { Amount, Badge, Card, CardTitle, Skeleton } from '@/shared/ui';

/** UC-1.2 — the accounts whose total is the app's starting cash. */
export function AccountsSection() {
  const { data, isPending } = useAccounts();

  return (
    <Card label="Accounts" className="flex flex-col gap-3">
      <CardTitle>Accounts</CardTitle>
      {isPending || data === undefined ? (
        <Skeleton className="h-16 w-full" />
      ) : data.accounts.length === 0 ? (
        <>
          <p className="text-sm text-zinc-500">
            No accounts yet. Their total is the app&rsquo;s starting cash.
          </p>
          <ManageAccounts accounts={[]} />
        </>
      ) : (
        <>
          <ul className="divide-y divide-zinc-100 text-sm">
            {data.accounts.map((account) => (
              <li key={account.id} className="flex items-center gap-3 py-1.5">
                <span className="flex-1">{account.name}</span>
                <Badge>{account.type.toLowerCase()}</Badge>
                <Amount cents={account.balance} className="w-28 text-right" />
              </li>
            ))}
            <li className="flex items-center gap-3 pt-2 text-sm font-semibold">
              <span className="flex-1">In accounts now</span>
              <Amount cents={data.total} className="w-28 text-right" />
            </li>
          </ul>
          <ManageAccounts accounts={data.accounts} />
        </>
      )}
    </Card>
  );
}
