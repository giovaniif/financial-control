import { describe, expect, it } from 'vitest';

import { formatBRL } from './money.js';

const NON_BREAKING_SPACES = /[\u00a0\u202f]/g;

describe('formatBRL', () => {
  it.each([
    [123456, 'R$ 1.234,56'],
    [0, 'R$ 0,00'],
    [-32000, '-R$ 320,00'],
    [5, 'R$ 0,05'],
  ])('renders %i cents as %s', (cents, expected) => {
    // Intl separates the symbol from the digits with a non-breaking space, not
    // a plain one, so normalise before comparing against a readable literal.
    expect(formatBRL(cents).replace(NON_BREAKING_SPACES, ' ')).toBe(expected);
  });
});
