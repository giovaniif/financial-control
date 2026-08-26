import type {
  CyclePosition,
  CycleProgressResponse,
  CycleResponse,
} from '@fin/contracts';
import { useEffect } from 'react';

import { useCycle } from '@/entities/cycle';
import { useDashboard } from '@/entities/dashboard';
import { useSelectedCycle } from '@/features/navigate-cycle';
import { EmptyState, Skeleton } from '@/shared/ui';
import { AppShell } from '@/widgets/app-shell';
import { UpcomingList } from '@/widgets/upcoming-list';

import type { MainFigures } from '../model/figures.js';
import { figuresFor } from '../model/figures.js';
import { BucketChips } from './bucket-chips.js';
import { ChainSection } from './chain-section.js';
import { CloseSection } from './close-section.js';
import { HeadlineSection } from './headline-section.js';
import { KpiSection } from './kpi-section.js';
import { ProgressSection } from './progress-section.js';

/**
 * UC-4 — the screen that justifies the whole payday-cycle model.
 *
 * It opens on the current cycle and speaks about the next: the question is
 * always asked from the middle of the cycle you are in. The assistant is the
 * shell's rail, not this screen's column, so an alert here hands its question
 * over rather than reaching into a panel it happens to render.
 */
export function MainPage() {
  const { cycles, selected, selectedMonth, isExplicit, select } =
    useSelectedCycle();
  const next = cycles.find((cycle) => cycle.position === 'next');

  // The screen is about the next cycle unless the user has said otherwise, so
  // it defaults there rather than to the current one. The default is written
  // back to the URL so the header's navigation shows the cycle on screen —
  // the two disagreeing is the bug this replaced.
  const month = isExplicit ? selectedMonth : (next?.month ?? selectedMonth);

  useEffect(() => {
    if (!isExplicit && next !== undefined) {
      select(next.month);
    }
  }, [isExplicit, next, select]);

  const { data, isPending, isError } = useDashboard(month);
  const { data: cycle } = useCycle(month);

  return (
    <AppShell
      title="Principal"
      subtitle="Quanto você vai pagar no próximo ciclo, e o que sobra até o próximo pagamento"
    >
      {isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : isError ? (
        <EmptyState
          title="Não foi possível montar o painel"
          body="Verifique se a API está rodando."
        />
      ) : (
        <Screen
          figures={figuresFor(data)}
          progress={data.progress}
          cycle={cycle}
          today={data.today}
          position={selected?.position}
        />
      )}
    </AppShell>
  );
}

/** The figures, in the order the calculation chain reads. */
function Screen({
  figures,
  progress,
  cycle,
  today,
  position,
}: {
  figures: MainFigures;
  progress: CycleProgressResponse;
  cycle: CycleResponse | undefined;
  today: string;
  position: CyclePosition | undefined;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <HeadlineSection
        headline={figures.headline}
        position={position}
        variance={figures.variance}
        action={<CloseSection cycle={cycle} today={today} />}
      />
      <KpiSection kpis={figures.kpis} />
      <ChainSection cycle={cycle} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ProgressSection progress={progress} />
        <BucketChips />
      </div>
      <UpcomingList entries={figures.upcoming} />
    </div>
  );
}
