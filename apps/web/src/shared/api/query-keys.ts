/**
 * Every query key in the app comes from here. Inline arrays scattered through
 * slices are how two places end up disagreeing about what identifies the same
 * cache entry, and invalidation silently stops working.
 */
export const queryKeys = {
  health: () => ['health'] as const,
} as const;
