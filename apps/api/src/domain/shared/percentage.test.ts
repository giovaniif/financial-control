import { describe, expect, it } from 'vitest';

import { Money } from './money.js';
import { InvalidPercentage, Percentage } from './percentage.js';

describe('Percentage', () => {
  it('holds a whole percentage exactly', () => {
    expect(Percentage.ofPercent(20).basisPoints).toBe(2000);
  });

  // The reason basis points exist here: a third of the surplus is 33,33 %, and
  // storing that as a float would drift every time it is applied.
  it('holds two decimal places exactly', () => {
    expect(Percentage.ofPercent(33.33).basisPoints).toBe(3333);
  });

  it('accepts more than 100 %, which the allocation warning depends on', () => {
    expect(Percentage.ofPercent(120).basisPoints).toBe(12000);
  });

  it.each([
    ['a negative percentage', -1],
    ['a third decimal place', 33.333],
    ['NaN', Number.NaN],
  ])('rejects %s', (_name, value) => {
    expect(() => Percentage.ofPercent(value)).toThrow(InvalidPercentage);
  });

  it('rejects fractional basis points', () => {
    expect(() => Percentage.ofBasisPoints(1.5)).toThrow(InvalidPercentage);
  });
});

describe('Percentage.of', () => {
  it('applies cleanly when the division is exact', () => {
    const share = Percentage.ofPercent(20).of(Money.fromCents(889000));

    expect(share.cents).toBe(177800);
  });

  it('rounds to the nearest cent, half away from zero', () => {
    expect(Percentage.ofPercent(33.33).of(Money.fromCents(100)).cents).toBe(33);
    expect(Percentage.ofPercent(50).of(Money.fromCents(101)).cents).toBe(51);
    expect(Percentage.ofPercent(50).of(Money.fromCents(-101)).cents).toBe(-51);
  });

  it('returns zero of anything as zero', () => {
    expect(Percentage.zero().of(Money.fromCents(889000)).isZero()).toBe(true);
  });

  it('returns the whole amount at 100 %', () => {
    expect(Percentage.ofPercent(100).of(Money.fromCents(123456)).cents).toBe(
      123456,
    );
  });
});

describe('Percentage arithmetic and comparison', () => {
  it('sums a list of shares, and sums the empty list to zero', () => {
    const total = Percentage.sum([
      Percentage.ofPercent(20),
      Percentage.ofPercent(10),
      Percentage.ofPercent(10),
    ]);

    expect(total.basisPoints).toBe(4000);
    expect(Percentage.sum([]).isZero()).toBe(true);
  });

  it('detects a set of rules that overcommits the surplus', () => {
    const rules = [Percentage.ofPercent(60), Percentage.ofPercent(50)];

    expect(Percentage.sum(rules).isGreaterThan(Percentage.hundred())).toBe(
      true,
    );
  });

  it('does not flag rules that add up to exactly 100 %', () => {
    const rules = [Percentage.ofPercent(60), Percentage.ofPercent(40)];

    expect(Percentage.sum(rules).isGreaterThan(Percentage.hundred())).toBe(
      false,
    );
  });

  it('renders itself the way the UI reads it', () => {
    expect(Percentage.ofPercent(33.33).toString()).toBe('33,33 %');
    expect(Percentage.ofPercent(20).toString()).toBe('20 %');
    expect(Percentage.ofPercent(12.5).toString()).toBe('12,5 %');
  });
});

describe('Percentage combination', () => {
  it('adds two rates', () => {
    const combined = Percentage.ofPercent(20).plus(Percentage.ofPercent(12.5));

    expect(combined.percent).toBe(32.5);
  });

  it('compares by value', () => {
    expect(Percentage.ofPercent(20).equals(Percentage.ofPercent(20))).toBe(
      true,
    );
    expect(Percentage.ofPercent(20).equals(Percentage.ofPercent(21))).toBe(
      false,
    );
  });
});
