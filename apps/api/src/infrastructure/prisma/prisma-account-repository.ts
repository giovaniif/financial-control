import type { PrismaClient } from '@prisma/client';

import type { Account } from '../../domain/budgeting/account.js';
import type { AccountRepository } from '../../domain/ports/repositories.js';
import { fromAccount, toAccount } from './mappers/account-mapper.js';

export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAll(): Promise<Account[]> {
    const rows = await this.prisma.account.findMany({
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });

    return rows.map(toAccount);
  }

  async findById(id: string): Promise<Account | undefined> {
    const row = await this.prisma.account.findUnique({ where: { id } });

    return row === null ? undefined : toAccount(row);
  }

  async save(account: Account): Promise<void> {
    const data = fromAccount(account);

    await this.prisma.account.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.account.delete({ where: { id } });
  }

  async deleteAll(): Promise<void> {
    await this.prisma.account.deleteMany();
  }
}
