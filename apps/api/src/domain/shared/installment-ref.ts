import { DomainError } from './domain-error.js';

export class InvalidInstallment extends DomainError {}

/** The position of one instalment within its plan: `3/10`. */
export class InstallmentRef {
  private constructor(
    readonly number: number,
    readonly total: number,
  ) {}

  static of(number: number, total: number): InstallmentRef {
    const whole = Number.isSafeInteger(number) && Number.isSafeInteger(total);
    if (!whole || total < 1 || number < 1 || number > total) {
      throw new InvalidInstallment(
        `Instalment ${String(number)} of ${String(total)} is not a position in a plan.`,
      );
    }
    return new InstallmentRef(number, total);
  }

  /** The last instalment is what retires the plan once it is billed. */
  get isLast(): boolean {
    return this.number === this.total;
  }

  get remaining(): number {
    return this.total - this.number;
  }

  next(): InstallmentRef | undefined {
    return this.isLast
      ? undefined
      : InstallmentRef.of(this.number + 1, this.total);
  }

  equals(other: InstallmentRef): boolean {
    return this.number === other.number && this.total === other.total;
  }

  toString(): string {
    return `${String(this.number)}/${String(this.total)}`;
  }
}
