import type {
  AlertResponse,
  CyclePosition,
  CycleProgressResponse,
  CycleResponse,
} from '@fin/contracts';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import { useCycle } from '@/entities/cycle';
import { useDashboard } from '@/entities/dashboard';
import { useSelectedCycle } from '@/features/navigate-cycle';
import { useSetupState } from '@/shared/api';
import { useMediaQuery } from '@/shared/lib';
import { useEstimates } from '@/shared/model';
import { EmptyState, Skeleton } from '@/shared/ui';
import { AlertList } from '@/widgets/alert-list';
import { AppShell } from '@/widgets/app-shell';
import { UpcomingList } from '@/widgets/upcoming-list';

import type { MainFigures } from '../model/figures.js';
import { questionFor } from '../model/alert-question.js';
import { figuresFor } from '../model/figures.js';
import { handToAssistant } from '../model/hand-to-assistant.js';
import { AssistantAside } from './assistant-aside.js';
import { BucketChips } from './bucket-chips.js';
import { ChainSection } from './chain-section.js';
import { CloseSection } from './close-section.js';
import { HeadlineSection } from './headline-section.js';
import { KpiSection } from './kpi-section.js';
import { ProgressSection } from './progress-section.js';

/** The width at which the chat can stand beside the figures without crowding them. */
const WIDE = '(min-width: 80rem)';

/**
 * UC-4 — the screen that justifies the whole payday-cycle model, with the
 * assistant beside it rather than bolted to a corner.
 *
 * It opens on the current cycle and speaks about the next: the question is
 * always asked from the middle of the cycle you are in.
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
  const { estimates } = useEstimates();
  const setup = useSetupState();

  const isWide = useMediaQuery(WIDE);
  const [isAsking, setIsAsking] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  const ask = (alert: AlertResponse) => {
    setIsAsking(true);
    handToAssistant(panel.current, questionFor(alert));
  };

  return (
    <AppShell
      title="Main"
      subtitle="How much you will pay next cycle, and what survives to the next payday"
    >
      {isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : isError ? (
        <EmptyState
          title="The dashboard could not be built"
          body="Check that the API is running."
        />
      ) : (
        <Screen
          figures={figuresFor(data, cycle, estimates)}
          progress={data.progress}
          alerts={data.alerts}
          cycle={cycle}
          today={data.today}
          position={selected?.position}
          onAsk={setup.data?.assistantAvailable === false ? undefined : ask}
          assistant={
            <AssistantAside
              isOpen={isWide || isAsking}
              isWide={isWide}
              onToggle={() => {
                setIsAsking((open) => !open);
              }}
              panelRef={panel}
            />
          }
        />
      )}
    </AppShell>
  );
}

/**
 * The figures and the chat are two columns that never compete: the figures
 * take the room they need, the chat holds a column of its own, and below the
 * wide breakpoint they stack instead of splitting a screen neither fits on.
 */
function Screen({
  figures,
  progress,
  alerts,
  cycle,
  today,
  position,
  onAsk,
  assistant,
}: {
  figures: MainFigures;
  progress: CycleProgressResponse;
  alerts: AlertResponse[];
  cycle: CycleResponse | undefined;
  today: string;
  position: CyclePosition | undefined;
  onAsk: ((alert: AlertResponse) => void) | undefined;
  assistant: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
      <div className="flex min-w-0 flex-col gap-4">
        <HeadlineSection
          headline={figures.headline}
          position={position}
          action={<CloseSection cycle={cycle} today={today} />}
        />
        <KpiSection kpis={figures.kpis} />
        <ChainSection cycle={cycle} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ProgressSection progress={progress} />
          <BucketChips />
        </div>
        <UpcomingList entries={figures.upcoming} />
        <AlertList alerts={alerts} onAsk={onAsk} />
      </div>
      {assistant}
    </div>
  );
}
