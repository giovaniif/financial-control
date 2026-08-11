import type { EstimateMode } from '@fin/contracts';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

import { EstimatesContext } from './estimates-context.js';

/**
 * UC-4.4 — one control switching every figure in the app between confirmed
 * only and including estimates. Not a per-screen setting: the whole app has
 * to answer consistently, or a guess silently mixes with a known bill.
 */
export function EstimatesProvider({ children }: { children: ReactNode }) {
  const [estimates, setEstimates] = useState<EstimateMode>('included');

  const value = useMemo(
    () => ({
      estimates,
      toggle: () => {
        setEstimates((current) =>
          current === 'included' ? 'excluded' : 'included',
        );
      },
    }),
    [estimates],
  );

  return <EstimatesContext value={value}>{children}</EstimatesContext>;
}
