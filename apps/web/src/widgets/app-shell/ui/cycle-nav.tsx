import { useSelectedCycle } from '@/features/navigate-cycle';
import { formatRange } from '@/shared/lib';
import { Badge, Skeleton } from '@/shared/ui';

const tones = {
  past: 'neutral',
  current: 'positive',
  next: 'info',
  projected: 'neutral',
} as const;

const positionLabels = {
  past: 'passado',
  current: 'atual',
  next: 'próximo',
  projected: 'projetado',
} as const;

/** Global, in the header: every screen respects the selected cycle. */
export function CycleNav() {
  const { selected, isPending, hasPrevious, hasNext, goPrevious, goNext } =
    useSelectedCycle();

  if (isPending) {
    return <Skeleton className="h-9 w-72" />;
  }
  if (selected === undefined) {
    return null;
  }

  return (
    <div className="flex items-center overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <button
        type="button"
        onClick={goPrevious}
        disabled={!hasPrevious}
        aria-label="Ciclo anterior"
        className="cursor-pointer border-r border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        ←
      </button>
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className="text-sm font-medium">{selected.label}</span>
        {/* The bounds are always stated: a cycle is not a month. */}
        <span className="font-mono text-xs text-zinc-500">
          {formatRange(selected.start, selected.end)}
        </span>
        <Badge tone={tones[selected.position]}>
          {positionLabels[selected.position]}
        </Badge>
      </div>
      <button
        type="button"
        onClick={goNext}
        disabled={!hasNext}
        aria-label="Próximo ciclo"
        className="cursor-pointer border-l border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        →
      </button>
    </div>
  );
}
