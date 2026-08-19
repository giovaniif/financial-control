import type { CycleResponse } from '@fin/contracts';

import { Skeleton } from '@/shared/ui';
import { ChainStrip } from '@/widgets/chain-strip';

/**
 * UC-3.1 — the calculation chain in the one order it is ever presented. It
 * moved here when the Ledger screen went, and it reads the selected cycle
 * rather than the dashboard, which does not carry the chain.
 */
export function ChainSection({ cycle }: { cycle: CycleResponse | undefined }) {
  if (cycle === undefined) {
    return <Skeleton className="h-24 w-full" />;
  }

  return (
    <ChainStrip
      chain={cycle.chain}
      openingFrom="carried in from the previous cycle"
    />
  );
}
