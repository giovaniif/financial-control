import { DomainError } from '../shared/domain-error.js';
import { Money } from '../shared/money.js';

export class InvalidAccount extends DomainError {}

export const AccountType = {
  Checking: 'CHECKING',
  Savings: 'SAVINGS',
  Cash: 'CASH',
} as const;

export type AccountType = (typeof AccountType)[keyof typeof AccountType];

interface AccountState {
  readonly id: string;
  readonly name: string;
  readonly type: AccountType;
  readonly balance: Money;
}

/**
 * Somewhere money actually sits. The sum across accounts is the app's starting
 * cash and the figure the sidebar carries permanently.
 */
export class Account {
  private constructor(private readonly state: AccountState) {}

  static open(input: {
    id: string;
    name: string;
    type: AccountType;
    balance: Money;
  }): Account {
    if (input.name.trim() === '') {
      throw new InvalidAccount('An account needs a name.');
    }
    return new Account({ ...input, name: input.name.trim() });
  }

  static totalOf(accounts: readonly Account[]): Money {
    return Money.sum(accounts.map((account) => account.balance));
  }

  get id(): string {
    return this.state.id;
  }

  get name(): string {
    return this.state.name;
  }

  get type(): AccountType {
    return this.state.type;
  }

  get balance(): Money {
    return this.state.balance;
  }

  rename(name: string): Account {
    if (name.trim() === '') {
      throw new InvalidAccount('An account needs a name.');
    }
    return new Account({ ...this.state, name: name.trim() });
  }

  /**
   * Sets the balance to an observed figure. A cheque account can legitimately
   * be overdrawn, so a negative balance is allowed here — unlike a bucket,
   * which cannot hold less than nothing.
   */
  correctBalanceTo(balance: Money): Account {
    return new Account({ ...this.state, balance });
  }
}
