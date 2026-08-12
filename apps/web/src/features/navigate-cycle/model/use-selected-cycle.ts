import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

import { useCycleWindow } from '@/entities/cycle';

/**
 * UC-3.3 — cycle navigation is global, so the selected cycle lives in the URL
 * rather than in a component. Every screen respects it, and a link to a cycle
 * is shareable and survives a reload.
 */
export function useSelectedCycle() {
  const [params, setParams] = useSearchParams();
  const { data, isPending } = useCycleWindow();

  const cycles = useMemo(() => data?.cycles ?? [], [data]);
  const current = cycles.find((cycle) => cycle.position === 'current');
  const chosen = params.get('cycle');
  const selectedMonth = chosen ?? current?.month;
  const selected = cycles.find((cycle) => cycle.month === selectedMonth);
  const index = cycles.findIndex((cycle) => cycle.month === selectedMonth);

  const select = useCallback(
    (month: string) => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.set('cycle', month);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return {
    cycles,
    selected,
    selectedMonth,
    /** False when the month is only the default, so a screen can pick its own. */
    isExplicit: chosen !== null,
    isPending,
    hasPrevious: index > 0,
    hasNext: index >= 0 && index < cycles.length - 1,
    select,
    goPrevious: () => {
      const target = cycles[index - 1];
      if (target !== undefined) select(target.month);
    },
    goNext: () => {
      const target = cycles[index + 1];
      if (target !== undefined) select(target.month);
    },
  };
}
