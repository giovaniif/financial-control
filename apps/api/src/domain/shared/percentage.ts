import { DomainError } from './domain-error.js';
import { Money } from './money.js';

export class InvalidPercentage extends DomainError {}

const BASIS_POINTS_PER_PERCENT = 100;
const BASIS_POINTS_PER_WHOLE = 10_000;

/**
 * A rate, held in **basis points**, so `33,33 %` is exact rather than a float
 * that drifts each time it is applied.
 *
 * Values above 100 % are legal: several allocation rules can be configured to
 * ask for more than the surplus, and the app has to detect that rather than
 * refuse to represent it.
 */
export class Percentage {
  private constructor(readonly basisPoints: number) {}

  static ofBasisPoints(basisPoints: number): Percentage {
    if (!Number.isSafeInteger(basisPoints) || basisPoints < 0) {
      throw new InvalidPercentage(
        `Basis points must be a whole number of at least 0; received ${String(basisPoints)}.`,
      );
    }
    return new Percentage(basisPoints);
  }

  static ofPercent(percent: number): Percentage {
    const basisPoints = percent * BASIS_POINTS_PER_PERCENT;
    if (!Number.isInteger(basisPoints)) {
      throw new InvalidPercentage(
        `A percentage carries at most two decimal places; received ${String(percent)}.`,
      );
    }
    return Percentage.ofBasisPoints(basisPoints);
  }

  static zero(): Percentage {
    return new Percentage(0);
  }

  static hundred(): Percentage {
    return new Percentage(BASIS_POINTS_PER_WHOLE);
  }

  static sum(rates: readonly Percentage[]): Percentage {
    return Percentage.ofBasisPoints(
      rates.reduce((total, rate) => total + rate.basisPoints, 0),
    );
  }

  /** This share of an amount, rounded to the nearest cent, half away from zero. */
  of(amount: Money): Money {
    const exact = (amount.cents * this.basisPoints) / BASIS_POINTS_PER_WHOLE;

    return Money.fromCents(Math.sign(exact) * Math.round(Math.abs(exact)));
  }

  plus(other: Percentage): Percentage {
    return Percentage.ofBasisPoints(this.basisPoints + other.basisPoints);
  }

  equals(other: Percentage): boolean {
    return this.basisPoints === other.basisPoints;
  }

  isGreaterThan(other: Percentage): boolean {
    return this.basisPoints > other.basisPoints;
  }

  isZero(): boolean {
    return this.basisPoints === 0;
  }

  get percent(): number {
    return this.basisPoints / BASIS_POINTS_PER_PERCENT;
  }

  toString(): string {
    return `${this.percent.toLocaleString('pt-BR')} %`;
  }
}
