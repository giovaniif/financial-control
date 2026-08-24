import { useAccounts } from '@/entities/account';
import { Amount, Skeleton } from '@/shared/ui';

interface Props {
  /**
   * `stacked` in the sidebar, `inline` in the header — which is where the
   * figure goes while the nav is folded to icons. UC-1.2 asks for it to be
   * permanently visible, so it moves rather than shrinking to a tooltip.
   */
  layout?: 'stacked' | 'inline';
}

/** UC-1.2 — the app's starting cash, summed server-side. */
export function AccountsTotal({ layout = 'stacked' }: Props) {
  const { data, isPending } = useAccounts();
  const isInline = layout === 'inline';
  const count = data?.accounts.length ?? 0;

  return (
    <div
      className={`flex rounded-lg border border-zinc-200 bg-white ${
        isInline
          ? 'shrink-0 items-center gap-2 px-3 py-1.5 whitespace-nowrap'
          : 'flex-col gap-1 p-3'
      }`}
    >
      <span className="text-[10px] font-semibold tracking-widest text-zinc-400 uppercase">
        Nas contas agora
      </span>
      {isPending ? (
        <Skeleton className="h-5 w-24" />
      ) : (
        <>
          <Amount
            cents={data?.total ?? 0}
            className={
              isInline ? 'text-sm font-semibold' : 'text-base font-semibold'
            }
          />
          <span className="text-xs text-zinc-500">
            {count} conta{count === 1 ? '' : 's'}
          </span>
        </>
      )}
    </div>
  );
}
