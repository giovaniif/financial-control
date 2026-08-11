import { amountLabel } from '../../../shared/ui/label.js';
import { currentCycleLabel } from '../model/store.js';

export const badge = (cents: number): string =>
  `${currentCycleLabel()} — ${amountLabel(cents)}`;
