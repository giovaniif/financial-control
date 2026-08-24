import { useAccounts } from '@/entities/account';
import { formatBRL } from '@/shared/lib';
import { Amount, Skeleton } from '@/shared/ui';

interface Props {
  /**
   * `stacked` in the sidebar; `inline` in the header, which is where the
   * figure goes while the nav is folded to icons. UC-1.2 asks for it to be
   * permanently visible, so it moves rather than shrinking to a tooltip.
   *
   * `compact` is that same header slot with the chat rail open: the figure
   * survives, its caption becomes the accessible name, and the whole control
   * stops competing with the cycle nav for a row.
   */
  layout?: 'stacked' | 'inline' | 'compact';
}

const LABEL = 'Nas contas agora';

/** UC-1.2 — the app's starting cash, summed server-side. */
export function AccountsTotal({ layout = 'stacked' }: Props) {
  const { data, isPending } = useAccounts();
  const isStacked = layout === 'stacked';
  const isCompact = layout === 'compact';
  const count = data?.accounts.length ?? 0;
  const accounts = `${String(count)} conta${count === 1 ? '' : 's'}`;

  return (
    <div
      // The caption it no longer draws, said in full on hover and to a screen
      // reader: a figure with no label is a number nobody can place.
      {...(isCompact
        ? {
            title: `${LABEL} — ${formatBRL(data?.total ?? 0)}, ${accounts}`,
          }
        : {})}
      className={`flex rounded-lg border border-zinc-200 bg-white ${
        isStacked
          ? 'flex-col gap-1 p-3'
          : 'shrink-0 items-center gap-2 px-3 py-1.5 whitespace-nowrap'
      }`}
    >
      {isCompact ? (
        <WalletIcon />
      ) : (
        <span className="text-[10px] font-semibold tracking-widest text-zinc-400 uppercase">
          {LABEL}
        </span>
      )}
      {isPending ? (
        <Skeleton className="h-5 w-24" />
      ) : (
        <>
          <Amount
            cents={data?.total ?? 0}
            className={
              isStacked ? 'text-base font-semibold' : 'text-sm font-semibold'
            }
          />
          <span className={isCompact ? 'sr-only' : 'text-xs text-zinc-500'}>
            {isCompact ? `${LABEL}, ${accounts}` : accounts}
          </span>
        </>
      )}
    </div>
  );
}

function WalletIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0 text-zinc-400"
    >
      <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5.5A2.5 2.5 0 0 1 3 16.5Z" />
      <path d="M16.5 12.5h.01" />
    </svg>
  );
}
