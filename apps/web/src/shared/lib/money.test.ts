import { describe, expect, it } from 'vitest';

import { formatBRL, formatBRLCompact } from './money.js';

// Intl separates `R$` from the digits with a non-breaking space.
const plain = (value: string) => value.replace(/\u00a0/g, ' ');

describe('formatBRL', () => {
  it.each([
    [123_456, 'R$ 1.234,56'],
    [0, 'R$ 0,00'],
    [-29_300, '-R$ 293,00'],
  ])('renders %i cents as %s', (cents, expected) => {
    expect(plain(formatBRL(cents))).toBe(expected);
  });
});

describe('formatBRLCompact', () => {
  it.each([
    ['below a thousand, the exact amount', 99_900, 'R$ 999,00'],
    ['thousands, one decimal', 14_200_000, 'R$ 142,0k'],
    ['millions, two decimals', 3_310_000_00, 'R$ 3,31M'],
    ['a negative keeps its sign', -14_200_000, '-R$ 142,0k'],
  ])('%s', (_name, cents, expected) => {
    expect(plain(formatBRLCompact(cents))).toBe(expected);
  });
});
