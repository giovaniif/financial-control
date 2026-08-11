import type { ViteUserConfig } from 'vitest/config';

type CoverageOptions = NonNullable<
  NonNullable<ViteUserConfig['test']>['coverage']
>;
type Thresholds = NonNullable<
  Extract<CoverageOptions, { thresholds?: unknown }>['thresholds']
>;

/**
 * The floors from .claude/testing.md. They are a ratchet: raise one only when
 * the measured coverage backing it has actually gone up, and never lower one to
 * make a PR pass.
 */
export const globalThresholds = {
  statements: 80,
  branches: 80,
  functions: 80,
  lines: 80,
} as const;

/**
 * `domain/` and `application/` are pure — no database, no HTTP, no clock — so
 * they are both the part most worth defending and the cheapest to cover.
 * Keyed by glob, these apply on top of the global floors.
 */
export const pureLayerThresholds = {
  'src/domain/**': {
    statements: 95,
    branches: 95,
    functions: 95,
    lines: 95,
  },
  'src/application/**': {
    statements: 95,
    branches: 95,
    functions: 95,
    lines: 95,
  },
} as const;

export function coverage(thresholds: Thresholds = globalThresholds) {
  return {
    provider: 'v8',
    reporter: ['text', 'lcov'],
    include: ['src/**/*.{ts,tsx}'],
    exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.d.ts'],
    thresholds,
  } satisfies CoverageOptions;
}
