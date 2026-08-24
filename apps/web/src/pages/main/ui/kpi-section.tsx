import type { KpiResponse } from '@fin/contracts';

import { StatTile } from '@/shared/ui';

/** UC-4.2 — four figures, each with the note that says what it is made of. */
export function KpiSection({ kpis }: { kpis: KpiResponse[] }) {
  return (
    <section
      aria-label="Figuras principais"
      className="grid grid-cols-1 gap-3 sm:grid-cols-3"
    >
      {kpis.map((kpi) => (
        <StatTile
          key={kpi.label}
          label={kpi.label}
          cents={kpi.amount}
          note={kpi.note}
        />
      ))}
    </section>
  );
}
