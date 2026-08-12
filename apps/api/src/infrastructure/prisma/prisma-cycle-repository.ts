import type { PrismaClient } from '@prisma/client';

import type { CycleRef } from '../../domain/budgeting/cycle-ref.js';
import type { Cycle } from '../../domain/budgeting/cycle.js';
import type { CycleRepository } from '../../domain/ports/repositories.js';
import { fromLedgerEntry, toCycle } from './mappers/cycle-mapper.js';

export class PrismaCycleRepository implements CycleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByMonth(ref: CycleRef): Promise<Cycle | undefined> {
    const row = await this.prisma.cycle.findUnique({
      where: { month: ref.month },
      include: { entries: { orderBy: { dueDate: 'asc' } } },
    });

    return row === null ? undefined : toCycle(row, ref);
  }

  async monthsBefore(month: string): Promise<readonly string[]> {
    const rows = await this.prisma.cycle.findMany({
      where: { month: { lt: month } },
      orderBy: { month: 'asc' },
      select: { month: true },
    });

    return rows.map((row) => row.month);
  }

  async allMonths(): Promise<readonly string[]> {
    const rows = await this.prisma.cycle.findMany({
      orderBy: { month: 'asc' },
      select: { month: true },
    });

    return rows.map((row) => row.month);
  }

  async deleteAll(): Promise<void> {
    await this.prisma.cycle.deleteMany();
  }

  /**
   * Saves the aggregate as a unit. Entries are replaced wholesale rather than
   * diffed: a cycle holds a few dozen rows at most, and a partial write would
   * leave the chain disagreeing with the entries it is derived from.
   */
  async save(cycle: Cycle): Promise<void> {
    const entries = cycle.entries.map((entry) =>
      fromLedgerEntry(entry, cycle.id),
    );
    const header = {
      month: cycle.ref.month,
      status: cycle.status,
      openingBalance: BigInt(cycle.openingBalance.cents),
    };

    await this.prisma.$transaction([
      this.prisma.cycle.upsert({
        where: { id: cycle.id },
        create: { id: cycle.id, ...header },
        update: header,
      }),
      this.prisma.ledgerEntry.deleteMany({ where: { cycleId: cycle.id } }),
      this.prisma.ledgerEntry.createMany({ data: entries }),
    ]);
  }
}
