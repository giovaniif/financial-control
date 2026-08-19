import type { CycleProgressResponse } from '@fin/contracts';

import { Amount, Card, CardTitle } from '@/shared/ui';

/** UC-4.3 — two readings side by side; the gap between them is the signal. */
export function ProgressSection({
  progress,
}: {
  progress: CycleProgressResponse;
}) {
  return (
    <Card label="Este ciclo até agora" className="flex flex-col gap-3">
      <CardTitle>Este ciclo até agora</CardTitle>
      <Bar
        label={`Dia ${String(progress.dayOfCycle)} de ${String(progress.cycleLength)}`}
        percent={progress.timePercent}
        tone="bg-zinc-900"
      />
      <Bar
        label="Gasto em relação ao previsto"
        percent={progress.spentPercent}
        tone={
          progress.spentPercent > progress.timePercent
            ? 'bg-red-600'
            : 'bg-green-600'
        }
      />
      <p className="text-xs text-zinc-500">
        <Amount cents={progress.spent} /> de{' '}
        <Amount cents={progress.plannedOut} /> previstos.
      </p>
    </Card>
  );
}

function Bar({
  label,
  percent,
  tone,
}: {
  label: string;
  percent: number;
  tone: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs">
        <span className="text-zinc-600">{label}</span>
        <span className="font-mono text-zinc-500">{percent}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
        <div
          className={`h-full rounded-full ${tone}`}
          style={{ width: `${String(Math.min(100, percent))}%` }}
        />
      </div>
    </div>
  );
}
