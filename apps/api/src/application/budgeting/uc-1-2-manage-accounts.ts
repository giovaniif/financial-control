import type { AccountType } from '../../domain/budgeting/account.js';
import { Account } from '../../domain/budgeting/account.js';
import type { AccountRepository } from '../../domain/ports/repositories.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import { Money } from '../../domain/shared/money.js';

export class AccountNotFound extends DomainError {}

export interface AccountView {
  readonly id: string;
  readonly name: string;
  readonly type: AccountType;
  readonly balanceCents: number;
}

export interface AccountsView {
  readonly accounts: readonly AccountView[];
  /** The sidebar figure: "In accounts now". Summed here, never in the browser. */
  readonly totalCents: number;
}

/** UC-1.2 — the accounts the app's starting cash is made of. */
export class ManageAccounts {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  async list(): Promise<AccountsView> {
    const accounts = await this.accounts.findAll();

    return {
      accounts: accounts.map(toView),
      totalCents: Account.totalOf(accounts).cents,
    };
  }

  async open(input: {
    name: string;
    type: AccountType;
    balanceCents: number;
  }): Promise<AccountView> {
    const account = Account.open({
      id: this.newId(),
      name: input.name,
      type: input.type,
      balance: Money.fromCents(input.balanceCents),
    });
    await this.accounts.save(account);

    return toView(account);
  }

  async rename(id: string, name: string): Promise<AccountView> {
    const renamed = (await this.require(id)).rename(name);
    await this.accounts.save(renamed);

    return toView(renamed);
  }

  async correctBalance(id: string, balanceCents: number): Promise<AccountView> {
    const corrected = (await this.require(id)).correctBalanceTo(
      Money.fromCents(balanceCents),
    );
    await this.accounts.save(corrected);

    return toView(corrected);
  }

  async close(id: string): Promise<void> {
    await this.require(id);
    await this.accounts.delete(id);
  }

  private async require(id: string): Promise<Account> {
    const account = await this.accounts.findById(id);
    if (account === undefined) {
      throw new AccountNotFound(`No account ${id}.`);
    }
    return account;
  }
}

function toView(account: Account): AccountView {
  return {
    id: account.id,
    name: account.name,
    type: account.type,
    balanceCents: account.balance.cents,
  };
}
