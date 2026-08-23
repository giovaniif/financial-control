import type { TemplateSummaryResponse } from '@fin/contracts';

import { StatTile } from '@/shared/ui';

/** UC-2.7 — the four figures that say what the user is already committed to. */
export function BillSummary({ summary }: { summary: TemplateSummaryResponse }) {
  return (
    <section
      aria-label="Compromissos por ciclo"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      <StatTile
        label="Compromisso fixo"
        cents={-summary.fixedCommitment}
        note={`${String(summary.activeOutcomeCount)} contas, por ciclo`}
        signed
      />
      <StatTile
        label="Receita fixa"
        cents={summary.fixedIncome}
        note="antes das variáveis"
        signed
      />
      <StatTile
        label="Estimativas não confirmadas"
        cents={-summary.unconfirmedEstimates}
        note="valores que você ainda está estimando"
        signed
      />
      <StatTile
        label="Encerrando em 12 ciclos"
        cents={0}
        note={
          summary.endingWithinTwelve.length === 0
            ? 'nada se encerra'
            : summary.endingWithinTwelve.join(', ')
        }
      />
    </section>
  );
}
