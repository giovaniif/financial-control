import type { CalculationChainResponse } from '@fin/contracts';

import { Amount } from '@/shared/ui';

/**
 * UC-3.1 — the whole model at a glance, in the one order it is ever presented:
 * Opening, Total Outcome, Surplus, Expected Surplus, Allocations, Net Surplus,
 * Closing. It looks identical on every cycle.
 */
export function ChainStrip({
  chain,
  openingFrom,
}: {
  chain: CalculationChainResponse;
  openingFrom: string;
}) {
  const steps = [
    {
      label: 'Saldo inicial',
      cents: chain.openingBalance,
      note: openingFrom,
    },
    {
      label: 'Total de saídas',
      cents: chain.totalOutcome,
      note: 'tudo que sai',
    },
    { label: 'Sobra', cents: chain.surplus, note: 'receita − despesa' },
    {
      label: 'Sobra Esperada',
      cents: chain.expectedSurplus,
      note: 'disponível para alocar',
    },
    {
      label: 'Alocações',
      cents: chain.allocations,
      note: 'para as caixinhas',
    },
    { label: 'Sobra Líquida', cents: chain.netSurplus, note: 'dinheiro livre' },
    {
      label: 'Saldo final',
      cents: chain.closingBalance,
      note: 'abertura do próximo ciclo',
    },
  ];

  return (
    <section
      aria-label="Cadeia de cálculo"
      className="grid grid-cols-2 divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white sm:grid-cols-4 xl:grid-cols-7 xl:divide-x"
    >
      {steps.map((step) => (
        <div key={step.label} className="flex flex-col gap-1 p-3">
          <span className="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
            {step.label}
          </span>
          <Amount cents={step.cents} className="text-sm font-semibold" />
          <span className="text-[11px] text-zinc-400">{step.note}</span>
        </div>
      ))}
    </section>
  );
}
