import { NavLink } from 'react-router';

import { useAccounts } from '@/entities/account';
import { Amount, Skeleton } from '@/shared/ui';

/** Three screens, per `docs/USE_CASES.md` §5 — few enough to need no grouping. */
const items = [
  { to: '/', label: 'Main' },
  { to: '/profile', label: 'Profile' },
  { to: '/savings', label: 'Investments & Savings' },
];

export function Sidebar() {
  const { data, isPending } = useAccounts();

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col gap-6 border-r border-zinc-200 bg-white py-5">
      <div className="flex items-center gap-2 px-5">
        <span className="flex size-6 items-center justify-center rounded-md bg-zinc-900 font-mono text-xs font-semibold text-zinc-50">
          R
        </span>
        <span className="text-sm font-semibold">Financial Control</span>
      </div>

      <nav className="flex flex-col gap-0.5">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `mx-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                isActive
                  ? 'bg-zinc-100 font-semibold text-zinc-900'
                  : 'text-zinc-600 hover:bg-zinc-50'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Permanently visible: the app's starting cash, summed server-side. */}
      <div className="mt-auto px-5">
        <div className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-3">
          <span className="text-[10px] font-semibold tracking-widest text-zinc-400 uppercase">
            In accounts now
          </span>
          {isPending ? (
            <Skeleton className="h-5 w-24" />
          ) : (
            <>
              <Amount
                cents={data?.total ?? 0}
                className="text-base font-semibold"
              />
              <span className="text-xs text-zinc-500">
                {data?.accounts.length ?? 0} account
                {data?.accounts.length === 1 ? '' : 's'}
              </span>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
