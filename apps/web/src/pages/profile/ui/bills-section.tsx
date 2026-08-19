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
        title="Salário"
        description="O que chega a cada ciclo. O dia em que cai é o dia do pagamento."
        bills={byDueDay(data.templates.filter(isIncome))}
        currentMonth={currentMonth}
        emptyTitle="Nenhum salário ainda"
        emptyBody="É contra a receita que um ciclo é medido — sem ela não há nada para gastar."
        action={
          <CreateTemplateButton
            currentMonth={currentMonth}
            label="Adicionar receita"
            direction="IN"
          />
        }
      />

      <BillList
        title="Contas a pagar"
        description="Tudo que sai, na ordem em que sai. As que você ainda está estimando ficam marcadas."
        bills={byDueDay(data.templates.filter((bill) => !isIncome(bill)))}
        currentMonth={currentMonth}
        emptyTitle="Nenhuma conta a pagar ainda"
        emptyBody="Aluguel, plano de saúde, energia. Cada uma preenche uma linha em todo ciclo futuro, no dia em que vence."
        action={
          <CreateTemplateButton
            currentMonth={currentMonth}
            label="Adicionar conta a pagar"
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
