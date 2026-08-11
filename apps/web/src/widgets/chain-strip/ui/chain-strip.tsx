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
    { label: 'Opening', cents: chain.openingBalance, note: openingFrom },
    {
      label: 'Total Outcome',
      cents: chain.totalOutcome,
      note: 'everything out',
    },
    { label: 'Surplus', cents: chain.surplus, note: 'income − outcome' },
    {
      label: 'Expected Surplus',
      cents: chain.expectedSurplus,
      note: 'available to allocate',
    },
    { label: 'Allocations', cents: chain.allocations, note: 'into buckets' },
    { label: 'Net Surplus', cents: chain.netSurplus, note: 'free cash' },
    {
      label: 'Closing',
      cents: chain.closingBalance,
      note: "next cycle's opening",
    },
  ];

  return (
    <div className="grid grid-cols-2 divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white sm:grid-cols-4 xl:grid-cols-7 xl:divide-x">
      {steps.map((step) => (
        <div key={step.label} className="flex flex-col gap-1 p-3">
          <span className="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
            {step.label}
          </span>
          <Amount cents={step.cents} className="text-sm font-semibold" />
          <span className="text-[11px] text-zinc-400">{step.note}</span>
        </div>
      ))}
    </div>
  );
}
