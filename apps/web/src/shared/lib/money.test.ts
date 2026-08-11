import { describe, expect, it } from 'vitest';

import { formatBRL, formatBRLCompact, parseBRL } from './money.js';

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

describe('parseBRL', () => {
  it.each([
    ['as it is written', '1.234,56', 123_456],
    ['without the thousands separator', '1234,56', 123_456],
    ['whole reais', '320', 32_000],
    ['a single decimal place', '9,5', 950],
    ['with the currency symbol', 'R$ 1.234,56', 123_456],
    ['a negative', '-293,00', -29_300],
    ['zero', '0', 0],
  ])('reads %s', (_name, input, expected) => {
    expect(parseBRL(input)).toBe(expected);
  });

  // A form must not turn a typo into a silent zero.
  it.each([
    ['empty', ''],
    ['only spaces', '   '],
    ['not a number', 'abc'],
    ['two separators', '1,2,3'],
    ['three decimal places', '1,234'],
  ])('refuses %s', (_name, input) => {
    expect(parseBRL(input)).toBeNull();
  });

  // Cents are integers all the way through; 0.1 + 0.2 never happens here.
  it('does not go through a float', () => {
    expect(parseBRL('0,07')).toBe(7);
    expect(parseBRL('1.000.000,01')).toBe(100_000_001);
  });
});
