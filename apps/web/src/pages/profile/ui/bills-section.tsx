import type { TemplateResponse } from '@fin/contracts';

import { useTemplates } from '@/entities/template';
import { CreateTemplateButton } from '@/features/manage-templates';
import { useSelectedCycle } from '@/features/navigate-cycle';
import { Skeleton } from '@/shared/ui';

import { BillList } from './bill-list.js';
import { BillSummary } from './bill-summary.js';

/**
 * UC-2 — the recurring money, in the three questions the setup conversation
 * asked: the salary, the bills that cost the same every cycle, and the ones
 * whose amount moves. The domain calls all three recurring templates; the
 * word stops here.
 *
 * A variable bill is a bill the setup recorded as an unconfirmed estimate,
 * which is the same distinction the conversation makes (UC-2.6).
 */
export function BillsSection() {
  const { data, isPending } = useTemplates();
  // A change applies from the selected cycle onward, never behind it.
  const { selectedMonth } = useSelectedCycle();
  const currentMonth = selectedMonth ?? '';

  if (isPending || data === undefined) {
    return <Skeleton className="h-64 w-full" />;
  }

  const outgoing = data.templates.filter((bill) => bill.direction === 'OUT');

  return (
    <>
      <BillSummary summary={data.summary} />

      <BillList
        title="Salary"
        description="What arrives each cycle. The day it lands is the payday anchor."
        bills={data.templates.filter(isIncome)}
        currentMonth={currentMonth}
        emptyBody="Income is what a cycle is measured against — without it there is nothing to spend."
        action={
          <CreateTemplateButton
            currentMonth={currentMonth}
            label="Add income"
            direction="IN"
          />
        }
      />

      <BillList
        title="Fixed bills"
        description="The same amount every cycle, each on its own due day."
        bills={outgoing.filter((bill) => !bill.isEstimate)}
        currentMonth={currentMonth}
        emptyBody="Rent, the health plan, a subscription. Each one fills a line in every future cycle, on the day it falls due."
        action={
          <CreateTemplateButton
            currentMonth={currentMonth}
            label="Add a fixed bill"
            direction="OUT"
          />
        }
      />

      <BillList
        title="Variable bills"
        description="The amount moves, so each is carried as an estimate until you confirm it."
        bills={outgoing.filter((bill) => bill.isEstimate)}
        currentMonth={currentMonth}
        emptyBody="Electricity, groceries — the ones whose amount changes. Every total can be read with them and without them."
        action={
          <CreateTemplateButton
            currentMonth={currentMonth}
            label="Add a variable bill"
            direction="OUT"
            isEstimateByDefault
          />
        }
      />
    </>
  );
}

function isIncome(bill: TemplateResponse): boolean {
  return bill.direction === 'IN';
}
