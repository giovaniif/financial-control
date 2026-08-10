import type { Account as AccountRow } from '@prisma/client';

import type { AccountType } from '../../../domain/budgeting/account.js';
import { Account } from '../../../domain/budgeting/account.js';
import { Money } from '../../../domain/shared/money.js';

export function toAccount(row: AccountRow): Account {
  return Account.open({
    id: row.id,
    name: row.name,
    type: row.type,
    balance: Money.fromCents(Number(row.balance)),
  });
}

export function fromAccount(account: Account): {
  id: string;
  name: string;
  type: AccountType;
  balance: bigint;
} {
  return {
    id: account.id,
    name: account.name,
    type: account.type,
    balance: BigInt(account.balance.cents),
  };
}
