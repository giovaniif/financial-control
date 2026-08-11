import { useEstimates } from '@/shared/model';

/**
 * UC-4.4 — one header control, and every total in the app answers the same
 * way. A forecast that silently mixes a guess with a known bill is the
 * failure this prevents.
 */
export function EstimatesToggle() {
  const { estimates, toggle } = useEstimates();
  const including = estimates === 'included';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={including}
      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
        including
          ? 'border-amber-200 bg-amber-50 text-amber-800'
          : 'border-zinc-200 bg-white text-zinc-600'
      }`}
    >
      <span
        className={`size-2 rounded-sm ${including ? 'bg-amber-500' : 'bg-zinc-400'}`}
      />
      {including ? 'Including estimates' : 'Confirmed only'}
    </button>
  );
}
