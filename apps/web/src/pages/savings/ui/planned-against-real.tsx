import type { BucketView } from '@/entities/bucket';
import { plannedAgainstReal } from '@/entities/bucket';
import { formatBRL } from '@/shared/lib';
import { Card, CardTitle, StatTile } from '@/shared/ui';

/**
 * UC-6.6 — what the rules said should have accumulated, against what is
 * actually there. The gap is the honest picture, and naming what causes it is
 * the whole reason the log keeps corrections rather than overwriting.
 */
export function PlannedAgainstReal({ bucket }: { bucket: BucketView }) {
  const { planned, real, gap } = plannedAgainstReal(bucket);

  return (
    <Card label="Previsto x real" className="flex flex-col gap-3 bg-white">
      <CardTitle>{bucket.name} — previsto x real</CardTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label="O que as regras previam"
          cents={planned}
          note="Cada aporte que as regras fizeram, mais o que cada ajuste substituiu"
        />
        <StatTile
          label="Realizado"
          cents={real}
          note="O acumulado de todo o histórico de eventos"
        />
        <StatTile label="Diferença" cents={gap} signed note={explain(gap)} />
      </div>
    </Card>
  );
}

function explain(gap: number): string {
  if (gap === 0) {
    return 'Exatamente o que as regras diziam que estaria aqui';
  }
  if (gap > 0) {
    return `${formatBRL(gap)} à frente do que as regras diziam — rendimentos e correções são a diferença`;
  }

  return `${formatBRL(-gap)} atrás do que as regras diziam — resgates e correções são a diferença`;
}
