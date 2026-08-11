import type { EstimateMode } from '@fin/contracts';
import { createContext } from 'react';

export interface EstimatesContextValue {
  readonly estimates: EstimateMode;
  readonly toggle: () => void;
}

/**
 * Its own file so the provider module exports only components, which is what
 * React Fast Refresh needs to swap a component without losing state.
 */
export const EstimatesContext = createContext<
  EstimatesContextValue | undefined
>(undefined);
