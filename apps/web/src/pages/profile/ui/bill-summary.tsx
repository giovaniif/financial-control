import type { TemplateSummaryResponse } from '@fin/contracts';

import { StatTile } from '@/shared/ui';

/** UC-2.7 — the four figures that say what the user is already committed to. */
export function BillSummary({ summary }: { summary: TemplateSummaryResponse }) {
  return (
    <section
      aria-label="Commitments per cycle"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      <StatTile
        label="Fixed commitment"
        cents={-summary.fixedCommitment}
        note={`${String(summary.activeOutcomeCount)} bills, every cycle`}
        signed
      />
      <StatTile
        label="Fixed income"
        cents={summary.fixedIncome}
        note="before any variables"
        signed
      />
      <StatTile
        label="Unconfirmed estimates"
        cents={-summary.unconfirmedEstimates}
        note="what you are still guessing at"
        signed
      />
      <StatTile
        label="Ending within 12 cycles"
        cents={0}
        note={
          summary.endingWithinTwelve.length === 0
            ? 'nothing falls off'
            : summary.endingWithinTwelve.join(', ')
        }
      />
    </section>
  );
}
