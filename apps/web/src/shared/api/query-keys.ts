import type { EstimateMode } from '@fin/contracts';

/**
 * Every query key in the app comes from here. Inline arrays scattered through
 * slices are how two places end up disagreeing about what identifies the same
 * cache entry, and invalidation silently stops working.
 */
export const queryKeys = {
  health: () => ['health'] as const,

  dashboard: () => ['dashboard'] as const,
  wealth: (month?: string, yields?: string) =>
    ['wealth', month ?? null, yields ?? null] as const,

  cycles: () => ['cycles'] as const,
  cycleWindow: (estimates: EstimateMode) =>
    ['cycles', 'window', estimates] as const,
  cycle: (month: string, estimates: EstimateMode) =>
    ['cycles', month, estimates] as const,
  allocationPreview: (month: string) =>
    ['cycles', month, 'allocation-preview'] as const,

  accounts: () => ['accounts'] as const,
  templates: () => ['templates'] as const,
  cards: () => ['cards'] as const,
  buckets: () => ['buckets'] as const,
  anchor: () => ['settings', 'anchor'] as const,
} as const;
