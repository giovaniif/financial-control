import type { CycleResponse } from '@fin/contracts';

import { CloseCycle } from '@/features/close-cycle';

interface Props {
  cycle: CycleResponse | undefined;
  /** The app's today, so closing is offered by the calendar and not by guesswork. */
  today: string;
}

/** UC-3.8 — offered once the cycle's end date has passed, never forced. */
export function CloseSection({ cycle, today }: Props) {
  if (cycle === undefined) {
    return null;
  }

  return (
    <CloseCycle
      month={cycle.month}
      label={cycle.label}
      status={cycle.status}
      hasEnded={cycle.end < today}
      unsettled={
        cycle.entries.filter(
          (entry) => entry.status === 'PENDING' || entry.status === 'OVERDUE',
        ).length
      }
    />
  );
}
