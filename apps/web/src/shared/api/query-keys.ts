import type { EstimateMode } from '@fin/contracts';

/**
 * Every query key in the app comes from here. Inline arrays scattered through
 * slices are how two places end up disagreeing about what identifies the same
 * cache entry, and invalidation silently stops working.
 */
export const queryKeys = {
  health: () => ['health'] as const,

  /**
   * Called with a month it identifies one cycle's dashboard; called without
   * one it is the prefix every mutation invalidates by. Appending a `null`
   * placeholder instead would stop `['dashboard']` matching `['dashboard',
   * '2026-09']`, and every settle would leave the figures stale.
   */
  dashboard: (month?: string) =>
    month === undefined
      ? (['dashboard'] as const)
      : (['dashboard', month] as const),
  wealth: (month?: string, yields?: string) =>
    ['wealth', month ?? null, yields ?? null] as const,

  cycles: () => ['cycles'] as const,
  cycleWindow: (estimates: EstimateMode) =>
    ['cycles', 'window', estimates] as const,
  cycle: (month: string, estimates: EstimateMode) =>
    ['cycles', month, estimates] as const,
  allocationPreview: (month: string) =>
    ['cycles', month, 'allocation-preview'] as const,
  reopenPreview: (month: string) =>
    ['cycles', month, 'reopen-preview'] as const,

  accounts: () => ['accounts'] as const,
  templates: () => ['templates'] as const,
  cards: () => ['cards'] as const,
  billingPreview: (cardId: string, purchasedOn: string) =>
    ['cards', cardId, 'billing-preview', purchasedOn] as const,
  buckets: () => ['buckets'] as const,
  anchor: () => ['settings', 'anchor'] as const,
  anchorResolve: (anchorDay: number, shiftPolicy: string) =>
    ['settings', 'anchor', 'resolve', anchorDay, shiftPolicy] as const,
  setup: () => ['setup'] as const,
} as const;
