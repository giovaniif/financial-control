import type {
  RecurringTemplate as TemplateRow,
  ValueScheduleStep as StepRow,
} from '@prisma/client';

import { RecurringTemplate } from '../../../domain/budgeting/recurring-template.js';
import { Money } from '../../../domain/shared/money.js';

type Row = TemplateRow & { valueSchedule: StepRow[] };

export function toTemplate(row: Row): RecurringTemplate {
  return RecurringTemplate.create({
    id: row.id,
    name: row.name,
    direction: row.direction,
    dueDayOfMonth: row.dueDayOfMonth,
    amount: Money.fromCents(Number(row.baseAmountCents)),
    startMonth: row.startMonth,
    ...(row.endMonth === null ? {} : { endMonth: row.endMonth }),
    isEstimate: row.isEstimate,
    status: row.status,
    valueSchedule: row.valueSchedule.map((step) => ({
      fromMonth: step.fromMonth,
      amount: Money.fromCents(Number(step.amountCents)),
    })),
  });
}

export function fromTemplate(template: RecurringTemplate): {
  header: Omit<TemplateRow, 'createdAt' | 'updatedAt'>;
  steps: { fromMonth: string; amountCents: bigint }[];
} {
  return {
    header: {
      id: template.id,
      name: template.name,
      direction: template.direction,
      dueDayOfMonth: template.dueDayOfMonth,
      baseAmountCents: BigInt(template.baseAmount.cents),
      startMonth: template.startMonth,
      endMonth: template.endMonth ?? null,
      status: template.status,
      isEstimate: template.isEstimate,
    },
    steps: template.valueSchedule.map((step) => ({
      fromMonth: step.fromMonth,
      amountCents: BigInt(step.amount.cents),
    })),
  };
}
