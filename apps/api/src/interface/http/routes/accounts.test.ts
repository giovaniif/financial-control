import type { AccountResponse, AccountsResponse } from '@fin/contracts';
import { describe, expect, it } from 'vitest';

import { ConfigurePaydayAnchor } from '../../../application/budgeting/uc-1-1-configure-payday-anchor.js';
import { ManageAccounts } from '../../../application/budgeting/uc-1-2-manage-accounts.js';
import {
  InMemoryAccountRepository,
  InMemoryCycleRepository,
  InMemorySettingsRepository,
} from '../../../application/testing/fakes.js';
import { FixedClock } from '../../../application/testing/fixed-clock.js';
import { Account, AccountType } from '../../../domain/budgeting/account.js';
import { noHolidays } from '../../../domain/ports/holiday-calendar.js';
import { Money } from '../../../domain/shared/money.js';
import { buildServer } from '../server.js';

const clock = FixedClock.at('2026-08-10T12:00:00Z');

const serverWith = (...accounts: Account[]) =>
  buildServer({
    clock,
    configureAnchor: new ConfigurePaydayAnchor(
      new InMemorySettingsRepository(),
      new InMemoryCycleRepository(),
      noHolidays,
      clock,
    ),
    manageAccounts: new ManageAccounts(
      new InMemoryAccountRepository(accounts),
      (() => {
        let next = 0;
        return () => `acc-${String(++next)}`;
      })(),
    ),
  });

const account = (id: string, name: string, cents: number) =>
  Account.open({
    id,
    name,
    type: AccountType.Checking,
    balance: Money.fromCents(cents),
  });

describe('GET /accounts', () => {
  it('lists the accounts with the total they add up to', async () => {
    const app = serverWith(
      account('a', 'Inter Checking', 166_000),
      account('b', 'Nubank Checking', 50_000),
    );

    const response = await app.inject({ method: 'GET', url: '/accounts' });
    const body = response.json<AccountsResponse>();

    expect(response.statusCode).toBe(200);
    expect(body.accounts).toHaveLength(2);
    expect(body.total).toBe(216_000);
  });

  it('reports an empty list rather than failing', async () => {
    const response = await serverWith().inject({
      method: 'GET',
      url: '/accounts',
    });

    expect(response.json<AccountsResponse>()).toEqual({
      accounts: [],
      total: 0,
    });
  });
});

describe('POST /accounts', () => {
  it('answers 201 with the account it created', async () => {
    const response = await serverWith().inject({
      method: 'POST',
      url: '/accounts',
      payload: { name: 'Wallet', type: 'CASH', balance: 5_000 },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json<AccountResponse>()).toEqual({
      id: 'acc-1',
      name: 'Wallet',
      type: 'CASH',
      balance: 5_000,
    });
  });

  it.each([
    ['a missing body', {}],
    ['an unknown type', { name: 'X', type: 'CRYPTO', balance: 0 }],
    ['a non-numeric balance', { name: 'X', type: 'CASH', balance: '5' }],
  ])('answers 400 to %s', async (_name, payload) => {
    const response = await serverWith().inject({
      method: 'POST',
      url: '/accounts',
      payload,
    });

    expect(response.statusCode).toBe(400);
  });

  it('answers 400 to a blank name', async () => {
    const response = await serverWith().inject({
      method: 'POST',
      url: '/accounts',
      payload: { name: '   ', type: 'CASH', balance: 0 },
    });

    expect(response.statusCode).toBe(400);
  });

  // Amounts cross the wire as integer cents, matching the domain's Money.
  it('answers 400 to a fractional balance', async () => {
    const response = await serverWith().inject({
      method: 'POST',
      url: '/accounts',
      payload: { name: 'Cash', type: 'CASH', balance: 12.5 },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('PATCH /accounts/:id', () => {
  it('renames', async () => {
    const app = serverWith(account('a', 'Cash', 18_000));

    const response = await app.inject({
      method: 'PATCH',
      url: '/accounts/a/name',
      payload: { name: 'Wallet' },
    });

    expect(response.json<AccountResponse>().name).toBe('Wallet');
  });

  it('corrects a balance, including into overdraft', async () => {
    const app = serverWith(account('a', 'Inter', 0));

    const response = await app.inject({
      method: 'PATCH',
      url: '/accounts/a/balance',
      payload: { balance: -42_000 },
    });

    expect(response.json<AccountResponse>().balance).toBe(-42_000);
  });

  it.each([
    ['/accounts/missing/name', { name: 'X' }],
    ['/accounts/missing/balance', { balance: 1 }],
  ])('answers 404 for %s', async (url, payload) => {
    const response = await serverWith().inject({
      method: 'PATCH',
      url,
      payload,
    });

    expect(response.statusCode).toBe(404);
  });

  it.each([
    ['/accounts/a/name', {}],
    ['/accounts/a/balance', {}],
  ])('answers 400 to a malformed body on %s', async (url, payload) => {
    const app = serverWith(account('a', 'Cash', 0));

    const response = await app.inject({ method: 'PATCH', url, payload });

    expect(response.statusCode).toBe(400);
  });
});

describe('DELETE /accounts/:id', () => {
  it('answers 204 and drops it from the total', async () => {
    const app = serverWith(account('a', 'Cash', 18_000));

    const deleted = await app.inject({ method: 'DELETE', url: '/accounts/a' });
    const listed = await app.inject({ method: 'GET', url: '/accounts' });

    expect(deleted.statusCode).toBe(204);
    expect(listed.json<AccountsResponse>().total).toBe(0);
  });

  it('answers 404 for an account that is not there', async () => {
    const response = await serverWith().inject({
      method: 'DELETE',
      url: '/accounts/missing',
    });

    expect(response.statusCode).toBe(404);
  });
});
