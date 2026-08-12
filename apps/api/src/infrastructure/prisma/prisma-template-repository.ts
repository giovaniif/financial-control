import type { PrismaClient } from '@prisma/client';

import type { RecurringTemplate } from '../../domain/budgeting/recurring-template.js';
import type { RecurringTemplateRepository } from '../../domain/ports/repositories.js';
import { fromTemplate, toTemplate } from './mappers/template-mapper.js';

export class PrismaTemplateRepository implements RecurringTemplateRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAll(): Promise<RecurringTemplate[]> {
    const rows = await this.prisma.recurringTemplate.findMany({
      include: { valueSchedule: { orderBy: { fromMonth: 'asc' } } },
      orderBy: { name: 'asc' },
    });

    return rows.map(toTemplate);
  }

  async findById(id: string): Promise<RecurringTemplate | undefined> {
    const row = await this.prisma.recurringTemplate.findUnique({
      where: { id },
      include: { valueSchedule: { orderBy: { fromMonth: 'asc' } } },
    });

    return row === null ? undefined : toTemplate(row);
  }

  /**
   * Saves the aggregate as a unit. The schedule is replaced wholesale: a
   * template carries a handful of steps, and a partial write would leave an
   * amount applying from a cycle the domain no longer knows about.
   */
  async save(template: RecurringTemplate): Promise<void> {
    const { header, steps } = fromTemplate(template);

    await this.prisma.$transaction([
      this.prisma.recurringTemplate.upsert({
        where: { id: header.id },
        create: header,
        update: header,
      }),
      this.prisma.valueScheduleStep.deleteMany({
        where: { templateId: header.id },
      }),
      this.prisma.valueScheduleStep.createMany({
        data: steps.map((step) => ({ ...step, templateId: header.id })),
      }),
    ]);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.recurringTemplate.delete({ where: { id } });
  }

  async deleteAll(): Promise<void> {
    await this.prisma.recurringTemplate.deleteMany();
  }
}
