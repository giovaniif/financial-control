export class Money {
  private constructor(readonly cents: number) {}

  static fromCents(cents: number): Money {
    return new Money(cents);
  }
}
