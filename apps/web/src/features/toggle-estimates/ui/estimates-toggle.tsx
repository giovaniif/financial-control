import { useEstimates } from '@/shared/model';

interface Props {
  /**
   * Icon-only, for a header the chat rail has taken a third of. The label
   * stays in the button rather than becoming a tooltip: it is the only thing
   * that says which way the toggle is pointing, and a dot alone says nothing.
   */
  compact?: boolean;
}

/**
 * UC-4.4 — one header control, and every total in the app answers the same
 * way. A forecast that silently mixes a guess with a known bill is the
 * failure this prevents.
 */
export function EstimatesToggle({ compact = false }: Props) {
  const { estimates, toggle } = useEstimates();
  const including = estimates === 'included';
  const label = including ? 'Com estimativas' : 'Somente confirmados';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={including}
      title={label}
      className={`flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border text-xs font-medium whitespace-nowrap transition-colors ${
        compact ? 'size-9 justify-center' : 'px-3 py-1.5'
      } ${
        including
          ? 'border-amber-200 bg-amber-50 text-amber-800'
          : 'border-zinc-200 bg-white text-zinc-600'
      }`}
    >
      {compact ? (
        <EstimateIcon />
      ) : (
        <span
          className={`size-2 rounded-sm ${including ? 'bg-amber-500' : 'bg-zinc-400'}`}
        />
      )}
      <span className={compact ? 'sr-only' : ''}>{label}</span>
    </button>
  );
}

/** The wave the app tags an unconfirmed figure with: `~estimate`. */
function EstimateIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className="size-4"
    >
      <path d="M4 14c2.5-4 5.5-4 8 0s5.5 4 8 0" />
    </svg>
  );
}
