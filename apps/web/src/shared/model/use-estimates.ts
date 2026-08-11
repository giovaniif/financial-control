import { use } from 'react';

import type { EstimatesContextValue } from './estimates-context.js';
import { EstimatesContext } from './estimates-context.js';

export function useEstimates(): EstimatesContextValue {
  const context = use(EstimatesContext);
  if (context === undefined) {
    throw new Error('useEstimates must be used inside an EstimatesProvider');
  }
  return context;
}
