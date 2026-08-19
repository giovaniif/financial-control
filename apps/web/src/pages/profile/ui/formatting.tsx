import { Card, CardTitle } from '@/shared/ui';

/** UC-1.4 — read-only, so the conventions are explicit rather than implied. */
export function Formatting() {
  const rows = [
    ['Moeda', 'R$ 1.234,56'],
    ['Datas', 'dd/MM/yyyy'],
    ['Dinheiro que sai', 'negativo, exibido em vermelho'],
    // Cycle labels come from the API, which still names months in English.
    ['Nome do ciclo', 'August 2026 (5 Aug – 3 Sep)'],
  ];

  return (
    <Card label="Formatação" className="flex flex-col gap-3">
      <CardTitle>Formatação</CardTitle>
      <dl className="flex flex-col gap-1.5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between">
            <dt className="text-zinc-500">{label}</dt>
            <dd className="font-mono text-xs">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
