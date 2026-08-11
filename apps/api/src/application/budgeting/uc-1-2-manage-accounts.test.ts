import { describe, expect, it } from 'vitest';

import { Account, AccountType } from '../../domain/budgeting/account.js';
import { Money } from '../../domain/shared/money.js';
import { InMemoryAccountRepository } from '../testing/fakes.js';
import { AccountNotFound, ManageAccounts } from './uc-1-2-manage-accounts.js';

const seeded = (...accounts: Account[]) =>
  new InMemoryAccountRepository(accounts);

const account = (id: string, name: string, type: AccountType, cents: number) =>
  Account.open({ id, name, type, balance: Money.fromCents(cents) });

/** Predictable ids, so a test never depends on a random one. */
const ids = () => {
  let next = 0;
  return () => `acc-${String(++next)}`;
};

describe('ManageAccounts.list', () => {
  it('reports every account and the total they add up to', async () => {
    const useCase = new ManageAccounts(
      seeded(
        account('a', 'Inter Checking', AccountType.Checking, 166_000),
        account('b', 'Nubank Checking', AccountType.Checking, 32_000),
        account('c', 'Cash', AccountType.Cash, 18_000),
      ),
    );

    const view = await useCase.list();

    expect(view.accounts).toHaveLength(3);
    expect(view.totalCents).toBe(216_000);
  });

  it('totals an empty list to zero', async () => {
    expect((await new ManageAccounts(seeded()).list()).totalCents).toBe(0);
  });

  it('nets an overdrawn account against the others', async () => {
    const useCase = new ManageAccounts(
      seeded(
        account('a', 'Savings', AccountType.Savings, 100_000),
        account('b', 'Checking', AccountType.Checking, -40_000),
      ),
    );

    expect((await useCase.list()).totalCents).toBe(60_000);
  });
});

describe('ManageAccounts.open', () => {
  it('stores a new account and reports it back', async () => {
    const repository = seeded();
    const useCase = new ManageAccounts(repository, ids());

    const opened = await useCase.open({
      name: 'Wallet',
      type: AccountType.Cash,
      balanceCents: 5_000,
    });

    expect(opened).toEqual({
      id: 'acc-1',
      name: 'Wallet',
      type: AccountType.Cash,
      balanceCents: 5_000,
    });
    expect(await repository.findById('acc-1')).toBeDefined();
  });

  it('refuses a blank name', async () => {
    const useCase = new ManageAccounts(seeded(), ids());

    await expect(
      useCase.open({ name: '  ', type: AccountType.Cash, balanceCents: 0 }),
    ).rejects.toThrow();
  });

  it('refuses a fractional balance, which is not a whole number of cents', async () => {
    const useCase = new ManageAccounts(seeded(), ids());

    await expect(
      useCase.open({ name: 'Cash', type: AccountType.Cash, balanceCents: 1.5 }),
    ).rejects.toThrow();
  });
});

describe('ManageAccounts.rename and correctBalance', () => {
  it('renames without touching the balance', async () => {
    const useCase = new ManageAccounts(
      seeded(account('a', 'Cash', AccountType.Cash, 18_000)),
    );

    const renamed = await useCase.rename('a', 'Wallet');

    expect(renamed.name).toBe('Wallet');
    expect(renamed.balanceCents).toBe(18_000);
  });

  it('sets the balance to an observed figure', async () => {
    const useCase = new ManageAccounts(
      seeded(account('a', 'Inter', AccountType.Checking, 166_000)),
    );

    expect((await useCase.correctBalance('a', 154_233)).balanceCents).toBe(
      154_233,
    );
  });

  it('allows a correction that leaves the account overdrawn', async () => {
    const useCase = new ManageAccounts(
      seeded(account('a', 'Inter', AccountType.Checking, 0)),
    );

    expect((await useCase.correctBalance('a', -42_000)).balanceCents).toBe(
      -42_000,
    );
  });

  it.each([
    ['renaming', (u: ManageAccounts) => u.rename('missing', 'X')],
    ['correcting', (u: ManageAccounts) => u.correctBalance('missing', 1)],
    ['closing', (u: ManageAccounts) => u.close('missing')],
  ])('refuses %s an account that is not there', async (_name, act) => {
    await expect(act(new ManageAccounts(seeded()))).rejects.toThrow(
      AccountNotFound,
    );
  });
});

describe('ManageAccounts.close', () => {
  it('removes the account from the total', async () => {
    const useCase = new ManageAccounts(
      seeded(
        account('a', 'Cash', AccountType.Cash, 18_000),
        account('b', 'Inter', AccountType.Checking, 166_000),
      ),
    );

    await useCase.close('a');

    const view = await useCase.list();
    expect(view.accounts).toHaveLength(1);
    expect(view.totalCents).toBe(166_000);
  });
});
