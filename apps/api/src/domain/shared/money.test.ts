import { describe, expect, it } from 'vitest';

import { InvalidAmount, Money, UnparsableAmount } from './money.js';

const cents = (n: number) => Money.fromCents(n);

describe('Money.fromCents', () => {
  it('holds the exact number of cents it was given', () => {
    expect(cents(123456).cents).toBe(123456);
  });

  it('represents outgoing money as a negative amount', () => {
    expect(cents(-29300).cents).toBe(-29300);
  });

  it.each([
    ['a fractional cent', 12.5],
    ['NaN', Number.NaN],
    ['infinity', Number.POSITIVE_INFINITY],
    ['a value beyond exact integer precision', Number.MAX_SAFE_INTEGER + 2],
  ])('rejects %s', (_name, value) => {
    expect(() => Money.fromCents(value)).toThrow(InvalidAmount);
  });
});

describe('Money.fromReais', () => {
  it.each([
    ['a grouped amount', '1.234,56', 123456],
    ['an ungrouped amount', '1234,56', 123456],
    ['millions', '1.234.567,89', 123456789],
    ['no decimal part', '1234', 123400],
    ['a single decimal digit', '12,3', 1230],
    ['a negative amount', '-293,00', -29300],
    ['zero', '0,00', 0],
    ['surrounding whitespace', '  12,34  ', 1234],
    ['a currency prefix', 'R$ 1.234,56', 123456],
  ])('parses %s', (_name, input, expected) => {
    expect(Money.fromReais(input).cents).toBe(expected);
  });

  it.each([
    ['an empty string', ''],
    ['letters', 'twelve'],
    ['a dot as the decimal separator', '12.34'],
    ['three decimal digits', '12,345'],
    ['mis-grouped thousands', '1.23,45'],
    ['two decimal separators', '1,2,3'],
    ['a trailing separator', '12,'],
  ])('rejects %s', (_name, input) => {
    expect(() => Money.fromReais(input)).toThrow(UnparsableAmount);
  });

  it('round-trips through toReais', () => {
    expect(Money.fromReais('1.234,56').toReais()).toBe('1.234,56');
    expect(cents(-29300).toReais()).toBe('-293,00');
    expect(Money.zero().toReais()).toBe('0,00');
  });
});

describe('Money arithmetic', () => {
  it('adds and subtracts without losing a cent', () => {
    expect(cents(1000).plus(cents(234)).cents).toBe(1234);
    expect(cents(1000).minus(cents(1234)).cents).toBe(-234);
  });

  it('multiplies by a whole number of times', () => {
    expect(cents(55254).times(3).cents).toBe(165762);
  });

  it('rejects a fractional multiplier, which would create a sub-cent', () => {
    expect(() => cents(100).times(1.5)).toThrow(InvalidAmount);
  });

  it('negates and takes the absolute value', () => {
    expect(cents(-29300).negate().cents).toBe(29300);
    expect(cents(-29300).abs().cents).toBe(29300);
    expect(cents(29300).abs().cents).toBe(29300);
  });

  it('sums a list, and sums the empty list to zero', () => {
    expect(Money.sum([cents(1000), cents(-250), cents(30)]).cents).toBe(780);
    expect(Money.sum([]).cents).toBe(0);
  });

  it('never mutates its operands', () => {
    const original = cents(1000);

    original.plus(cents(500));
    original.negate();

    expect(original.cents).toBe(1000);
  });
});

describe('Money.dividedInto', () => {
  it('splits evenly when the amount divides exactly', () => {
    const parts = cents(30000).dividedInto(3);

    expect(parts.map((p) => p.cents)).toEqual([10000, 10000, 10000]);
  });

  it('gives the remainder to the last part, so nothing is lost', () => {
    const parts = cents(10000).dividedInto(3);

    expect(parts.map((p) => p.cents)).toEqual([3333, 3333, 3334]);
  });

  it('splits a negative amount without losing a cent either', () => {
    const parts = cents(-10000).dividedInto(3);

    expect(parts.map((p) => p.cents)).toEqual([-3333, -3333, -3334]);
  });

  it('returns the whole amount when split into one', () => {
    expect(
      cents(12345)
        .dividedInto(1)
        .map((p) => p.cents),
    ).toEqual([12345]);
  });

  // The property the instalment plan depends on: an invoice split across N
  // months must bill exactly what was purchased, for every N.
  it.each([1, 2, 3, 4, 5, 6, 7, 10, 12, 18, 24, 48, 60])(
    'sums back to the original across %i parts',
    (count) => {
      for (const amount of [1, 7, 99, 100, 12345, 55254, 999999, -55254]) {
        const parts = Money.fromCents(amount).dividedInto(count);

        expect(parts).toHaveLength(count);
        expect(Money.sum(parts).cents).toBe(amount);
      }
    },
  );

  it.each([0, -1, 2.5])('rejects an invalid part count of %s', (count) => {
    expect(() => cents(100).dividedInto(count)).toThrow(InvalidAmount);
  });
});

describe('Money comparison', () => {
  it('compares by value, not by identity', () => {
    expect(cents(1234).equals(cents(1234))).toBe(true);
    expect(cents(1234).equals(cents(1235))).toBe(false);
  });

  it('orders amounts', () => {
    expect(cents(100).isLessThan(cents(200))).toBe(true);
    expect(cents(200).isGreaterThan(cents(100))).toBe(true);
    expect(cents(100).isLessThan(cents(100))).toBe(false);
  });

  it('reports its sign, treating zero as neither', () => {
    expect(Money.zero().isZero()).toBe(true);
    expect(cents(-1).isNegative()).toBe(true);
    expect(cents(1).isPositive()).toBe(true);
    expect(Money.zero().isNegative()).toBe(false);
    expect(Money.zero().isPositive()).toBe(false);
  });
});
