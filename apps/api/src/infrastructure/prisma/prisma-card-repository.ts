import type { PrismaClient } from '@prisma/client';

import type { Card } from '../../domain/cards/card.js';
import type { CardRepository } from '../../domain/ports/repositories.js';
import { fromCard, toCard } from './mappers/card-mapper.js';

const withChildren = {
  invoices: {
    include: { items: true },
    orderBy: { dueDate: 'asc' },
  },
  plans: true,
} as const;

export class PrismaCardRepository implements CardRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAll(): Promise<Card[]> {
    const rows = await this.prisma.card.findMany({
      include: withChildren,
      orderBy: { name: 'asc' },
    });

    return rows.map(toCard);
  }

  async findById(id: string): Promise<Card | undefined> {
    const row = await this.prisma.card.findUnique({
      where: { id },
      include: withChildren,
    });

    return row === null ? undefined : toCard(row);
  }

  /**
   * Saves the aggregate as a unit, replacing invoices and items wholesale. A
   * card holds a bounded number of both, and a partial write would leave an
   * invoice total disagreeing with the items it is derived from.
   */
  async save(card: Card): Promise<void> {
    const { header, invoices, items, plans } = fromCard(card);

    await this.prisma.$transaction([
      this.prisma.card.upsert({
        where: { id: header.id },
        create: header,
        update: header,
      }),
      this.prisma.invoiceItem.deleteMany({
        where: { invoice: { cardId: header.id } },
      }),
      this.prisma.installmentPlan.deleteMany({ where: { cardId: header.id } }),
      this.prisma.invoice.deleteMany({ where: { cardId: header.id } }),
      this.prisma.invoice.createMany({ data: invoices }),
      this.prisma.invoiceItem.createMany({ data: items }),
      this.prisma.installmentPlan.createMany({ data: plans }),
    ]);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.card.delete({ where: { id } });
  }

  async deleteAll(): Promise<void> {
    await this.prisma.card.deleteMany();
  }
}
