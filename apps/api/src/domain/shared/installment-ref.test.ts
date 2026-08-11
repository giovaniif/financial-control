import { describe, expect, it } from 'vitest';

import { InstallmentRef, InvalidInstallment } from './installment-ref.js';

describe('InstallmentRef', () => {
  it('renders as the position the invoice line shows', () => {
    expect(InstallmentRef.of(3, 10).toString()).toBe('3/10');
  });

  it.each([
    ['a position of zero', 0, 10],
    ['a position past the total', 11, 10],
    ['a total of zero', 1, 0],
    ['a fractional position', 1.5, 10],
  ])('rejects %s', (_name, number, total) => {
    expect(() => InstallmentRef.of(number, total)).toThrow(InvalidInstallment);
  });

  it('knows when it is the last instalment, which retires the plan', () => {
    expect(InstallmentRef.of(10, 10).isLast).toBe(true);
    expect(InstallmentRef.of(9, 10).isLast).toBe(false);
  });

  it('counts how many are left after it', () => {
    expect(InstallmentRef.of(3, 10).remaining).toBe(7);
    expect(InstallmentRef.of(10, 10).remaining).toBe(0);
  });

  it('advances to the next position', () => {
    expect(InstallmentRef.of(3, 10).next()?.toString()).toBe('4/10');
  });

  it('has no next position once it is the last', () => {
    expect(InstallmentRef.of(10, 10).next()).toBeUndefined();
  });

  it('compares by value', () => {
    expect(InstallmentRef.of(3, 10).equals(InstallmentRef.of(3, 10))).toBe(
      true,
    );
    expect(InstallmentRef.of(3, 10).equals(InstallmentRef.of(3, 12))).toBe(
      false,
    );
  });
});
