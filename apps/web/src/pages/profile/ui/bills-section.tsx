import type { TemplateResponse } from '@fin/contracts';

import { useTemplates } from '@/entities/template';
import { CreateTemplateButton } from '@/features/manage-templates';
import { useSelectedCycle } from '@/features/navigate-cycle';
import { Skeleton } from '@/shared/ui';

import { BillList } from './bill-list.js';
import { BillSummary } from './bill-summary.js';

/**
 * UC-2 — the recurring money, in the two questions that are actually
 * different: what arrives, and what goes out. The domain calls both recurring
 * templates; the word stops here.
 *
 * There is one list of bills and not two. "Variable" is not a kind of bill —
 * it is a bill whose amount is still a guess, which `isEstimate` already
 * says (UC-2.6), and splitting the list on it made confirming an amount move
 * the row.
 */
export function BillsSection() {
  const { data, isPending } = useTemplates();
  // A change applies from the selected cycle onward, never behind it.
  const { selectedMonth } = useSelectedCycle();
  const currentMonth = selectedMonth ?? '';

  if (isPending || data === undefined) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <>
      <BillSummary summary={data.summary} />

      <BillList
        title="Salary"
        description="What arrives each cycle. The day it lands is the payday anchor."
        bills={byDueDay(data.templates.filter(isIncome))}
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
        title="Bills"
        description="Everything that goes out, in the order it leaves. The ones you are still guessing at are tagged."
        bills={byDueDay(data.templates.filter((bill) => !isIncome(bill)))}
        currentMonth={currentMonth}
        emptyBody="Rent, the health plan, electricity. Each one fills a line in every future cycle, on the day it falls due."
        action={
          <CreateTemplateButton
            currentMonth={currentMonth}
            label="Add a bill"
            direction="OUT"
          />
        }
      />
    </>
  );
}

function isIncome(bill: TemplateResponse): boolean {
  return bill.direction === 'IN';
}

function byDueDay(bills: TemplateResponse[]): TemplateResponse[] {
  return [...bills].sort(
    (one, other) => one.dueDayOfMonth - other.dueDayOfMonth,
  );
}
