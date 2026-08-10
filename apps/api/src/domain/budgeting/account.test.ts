import { describe, expect, it } from 'vitest';

import { Money } from '../shared/money.js';
import { Account, AccountType, InvalidAccount } from './account.js';

const anAccount = (name: string, type: AccountType, cents: number) =>
  Account.open({ id: name, name, type, balance: Money.fromCents(cents) });

describe('Account', () => {
  it('holds what it was opened with', () => {
    const account = anAccount('Inter Checking', AccountType.Checking, 166_000);

    expect(account.name).toBe('Inter Checking');
    expect(account.type).toBe(AccountType.Checking);
    expect(account.balance.cents).toBe(166_000);
  });

  it.each(['', '   '])('rejects a blank name (%s)', (name) => {
    expect(() => anAccount(name, AccountType.Cash, 0)).toThrow(InvalidAccount);
  });

  it('trims the name it is given', () => {
    expect(anAccount('  Cash  ', AccountType.Cash, 0).name).toBe('Cash');
  });

  it('renames without touching the balance', () => {
    const renamed = anAccount('Cash', AccountType.Cash, 18_000).rename(
      'Wallet',
    );

    expect(renamed.name).toBe('Wallet');
    expect(renamed.balance.cents).toBe(18_000);
  });

  it('rejects renaming to nothing', () => {
    expect(() => anAccount('Cash', AccountType.Cash, 0).rename(' ')).toThrow(
      InvalidAccount,
    );
  });
});

describe('Account.correctBalanceTo', () => {
  it('sets the balance to the observed figure', () => {
    const corrected = anAccount(
      'Inter Checking',
      AccountType.Checking,
      166_000,
    ).correctBalanceTo(Money.fromCents(154_233));

    expect(corrected.balance.cents).toBe(154_233);
  });

  // A cheque account can be overdrawn — unlike a bucket, which cannot hold
  // less than nothing.
  it('allows an overdrawn balance', () => {
    const overdrawn = anAccount(
      'Inter Checking',
      AccountType.Checking,
      0,
    ).correctBalanceTo(Money.fromCents(-42_000));

    expect(overdrawn.balance.isNegative()).toBe(true);
  });

  it('never mutates the account it corrects', () => {
    const account = anAccount('Cash', AccountType.Cash, 18_000);

    account.correctBalanceTo(Money.zero());

    expect(account.balance.cents).toBe(18_000);
  });
});

describe('Account.totalOf', () => {
  // The sidebar figure: "In accounts now — R$ 2.160,00 · 3 accounts".
  it('sums every account into the starting cash', () => {
    const total = Account.totalOf([
      anAccount('Inter Checking', AccountType.Checking, 166_000),
      anAccount('Nubank Checking', AccountType.Checking, 32_000),
      anAccount('Cash', AccountType.Cash, 18_000),
    ]);

    expect(total.cents).toBe(216_000);
  });

  it('nets an overdrawn account against the others', () => {
    const total = Account.totalOf([
      anAccount('Savings', AccountType.Savings, 100_000),
      anAccount('Checking', AccountType.Checking, -40_000),
    ]);

    expect(total.cents).toBe(60_000);
  });

  it('totals no accounts to zero', () => {
    expect(Account.totalOf([]).isZero()).toBe(true);
  });
});
