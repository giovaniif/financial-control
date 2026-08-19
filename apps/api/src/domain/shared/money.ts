import { DomainError } from './domain-error.js';

export class InvalidAmount extends DomainError {}
export class UnparsableAmount extends DomainError {}

const CENTS_PER_REAL = 100;

/**
 * `1.234,56`, `1234,56`, `-293,00`, `12,3`, `1234`. Thousands grouping is
 * optional but must be well formed when present, so a typo like `1.23,45` is
 * rejected rather than silently read as some other amount.
 */
const REAIS =
  /^(?<sign>-)?(?:R\$\s*)?(?<whole>\d{1,3}(?:\.\d{3})+|\d+)(?:,(?<fraction>\d{1,2}))?$/;

/**
 * An amount of Brazilian Real, held as **integer cents**.
 *
 * Never a float and never `number` arithmetic on reais: accumulated float
 * drift is the specific failure of the spreadsheet this application replaces.
 * Outgoing money is negative.
 */
export class Money {
  private constructor(readonly cents: number) {}

  static fromCents(cents: number): Money {
    if (!Number.isSafeInteger(cents)) {
      throw new InvalidAmount(
        `Um valor em dinheiro é um número inteiro de centavos; recebido ${String(cents)}.`,
      );
    }
    return new Money(cents);
  }

  static fromReais(input: string): Money {
    const groups = REAIS.exec(input.trim())?.groups;
    if (groups === undefined) {
      throw new UnparsableAmount(`Não é um valor em reais: "${input}".`);
    }

    const whole = Number(groups['whole']?.replaceAll('.', '') ?? '0');
    // `12,3` means thirty centavos, not three.
    const fraction = Number((groups['fraction'] ?? '').padEnd(2, '0'));
    const magnitude = whole * CENTS_PER_REAL + fraction;

    return Money.fromCents(groups['sign'] === '-' ? -magnitude : magnitude);
  }

  static zero(): Money {
    return new Money(0);
  }

  static sum(amounts: readonly Money[]): Money {
    return amounts.reduce<Money>(
      (total, next) => total.plus(next),
      Money.zero(),
    );
  }

  plus(other: Money): Money {
    return Money.fromCents(this.cents + other.cents);
  }

  minus(other: Money): Money {
    return Money.fromCents(this.cents - other.cents);
  }

  times(multiplier: number): Money {
    if (!Number.isSafeInteger(multiplier)) {
      throw new InvalidAmount(
        `Um multiplicador fracionário criaria um valor menor que um centavo; recebido ${String(multiplier)}.`,
      );
    }
    return Money.fromCents(this.cents * multiplier);
  }

  negate(): Money {
    return Money.fromCents(-this.cents);
  }

  abs(): Money {
    return Money.fromCents(Math.abs(this.cents));
  }

  /**
   * Splits into `count` parts that sum back to this amount exactly. The last
   * part absorbs the rounding remainder, so an instalment plan always bills
   * precisely what was purchased and cents never vanish.
   */
  dividedInto(count: number): Money[] {
    if (!Number.isSafeInteger(count) || count < 1) {
      throw new InvalidAmount(
        `Não dá para dividir em ${String(count)} partes; é preciso um número inteiro de pelo menos 1.`,
      );
    }

    const each = Math.trunc(this.cents / count);
    const parts = Array.from({ length: count - 1 }, () =>
      Money.fromCents(each),
    );

    return [...parts, this.minus(Money.fromCents(each * (count - 1)))];
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }

  isLessThan(other: Money): boolean {
    return this.cents < other.cents;
  }

  isGreaterThan(other: Money): boolean {
    return this.cents > other.cents;
  }

  isZero(): boolean {
    return this.cents === 0;
  }

  isNegative(): boolean {
    return this.cents < 0;
  }

  isPositive(): boolean {
    return this.cents > 0;
  }

  /** The Brazilian rendering, without the `R$` prefix: `1.234,56`. */
  toReais(): string {
    const magnitude = Math.abs(this.cents);
    const whole = Math.trunc(magnitude / CENTS_PER_REAL);
    const fraction = String(magnitude % CENTS_PER_REAL).padStart(2, '0');
    const grouped = whole.toLocaleString('pt-BR');

    return `${this.cents < 0 ? '-' : ''}${grouped},${fraction}`;
  }
}
