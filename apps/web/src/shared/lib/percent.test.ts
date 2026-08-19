import { describe, expect, it } from 'vitest';

import { formatPercent } from './percent.js';

describe('formatPercent', () => {
  it.each([
    ['a whole share loses its decimals', 20, '20%'],
    ['a fraction keeps one', 8.5, '8,5%'],
    ['a long fraction is cut, not padded', 33.333, '33,3%'],
    ['zero is a real share', 0, '0%'],
  ])('%s', (_name, value, expected) => {
    expect(formatPercent(value)).toBe(expected);
  });

  // UC-6.2 shows a fixed amount as a share of Expected Surplus, where a bare
  // "20%" reads as rounder than the figure behind it.
  it('pads to a fixed number of decimals when asked', () => {
    expect(formatPercent(20, 1)).toBe('20,0%');
  });
});
