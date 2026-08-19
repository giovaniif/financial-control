import { useCallback, useState } from 'react';

import { STEPS, type StepId } from './steps.js';

export interface Wizard {
  index: number;
  stepId: StepId;
  isFirst: boolean;
  isLast: boolean;
  next: () => void;
  back: () => void;
}

/**
 * The wizard's position. Held in one place because later steps arrive
 * pre-filled from an imported spreadsheet, and that state has to survive
 * moving back and forth.
 */
export function useWizard(): Wizard {
  const [index, setIndex] = useState(0);

  const next = useCallback(() => {
    setIndex((current) => Math.min(current + 1, STEPS.length - 1));
  }, []);

  const back = useCallback(() => {
    setIndex((current) => Math.max(current - 1, 0));
  }, []);

  const step = STEPS[index] ?? STEPS[0];

  return {
    index,
    stepId: step?.id ?? 'why',
    isFirst: index === 0,
    isLast: index === STEPS.length - 1,
    next,
    back,
  };
}
