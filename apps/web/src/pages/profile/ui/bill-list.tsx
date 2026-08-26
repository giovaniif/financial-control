import type { TemplateResponse } from '@fin/contracts';
import type { ReactNode } from 'react';

import { EditTemplate } from '@/features/manage-templates';
import { Amount, Badge, CardTitle, EmptyState } from '@/shared/ui';

const statusTones = {
  ACTIVE: 'positive',
  PAUSED: 'neutral',
  ENDED: 'neutral',
} as const;

const statusLabels = {
  ACTIVE: 'Ativa',
  PAUSED: 'Pausada',
  ENDED: 'Encerrada',
} as const;

interface Props {
  title: string;
  description: string;
  bills: TemplateResponse[];
  /** A change applies from the selected cycle onward, never behind it. */
  currentMonth: string;
  emptyTitle: string;
  emptyBody: string;
  /** The control that adds one of these — the page supplies it. */
  action: ReactNode;
}

/** One kind of recurring money — the salary, the fixed bills, the variable ones. */
export function BillList({
  title,
  description,
  bills,
  currentMonth,
  emptyTitle,
  emptyBody,
  action,
}: Props) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <CardTitle>{title}</CardTitle>
          <p className="text-xs text-zinc-500">{description}</p>
        </div>
        {action}
      </div>

      {bills.length === 0 ? (
        <EmptyState title={emptyTitle} body={emptyBody} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-[10px] tracking-wider text-zinc-500 uppercase">
                <th className="px-4 py-2 font-semibold">Nome</th>
                <th className="px-4 py-2 font-semibold">Dia de vencimento</th>
                <th className="px-4 py-2 text-right font-semibold">Valor</th>
                <th className="px-4 py-2 font-semibold">Próximo</th>
                <th className="px-4 py-2 font-semibold">Situação</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {bills.map((bill) => (
                <BillRow
                  key={bill.id}
                  bill={bill}
                  currentMonth={currentMonth}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function BillRow({
  bill,
  currentMonth,
}: {
  bill: TemplateResponse;
  currentMonth: string;
}) {
  const dimmed = bill.status !== 'ACTIVE';

  return (
    <>
      <tr className={dimmed ? 'opacity-50' : undefined}>
        <td className="px-4 py-2">
          <span className="flex items-center gap-2">
            {bill.name}
            {/* UC-2.6 — a guess is tagged everywhere it appears. */}
            {bill.isEstimate && <Badge tone="warning">~estimativa</Badge>}
            {/* UC-2.4 — only a bill whose amount actually changes ahead. An
                ordinary correction sets the amount and carries no badge. */}
            {bill.valueSchedule.length > 0 && (
              <Badge tone="info">o valor muda</Badge>
            )}
          </span>
        </td>
        <td className="px-4 py-2 font-mono text-xs text-zinc-500">
          dia {bill.dueDayOfMonth}
        </td>
        <td className="px-4 py-2 text-right">
          <Amount cents={bill.amount} signed />
        </td>
        <td className="px-4 py-2 font-mono text-xs text-zinc-500">
          {bill.nextOccurrenceMonth ?? '—'}
        </td>
        <td className="px-4 py-2">
          <Badge tone={statusTones[bill.status]}>
            {bill.endMonth === null
              ? statusLabels[bill.status]
              : `encerra em ${bill.endMonth}`}
          </Badge>
        </td>
        <td className="px-4 py-2 text-right">
          <EditTemplate template={bill} currentMonth={currentMonth} />
        </td>
      </tr>
      {/* UC-2.4 — the steps expand in place, so a climbing cost is legible. */}
      {bill.valueSchedule.map((step) => (
        <tr key={`${bill.id}-${step.fromMonth}`} className="bg-zinc-50/60">
          <td className="py-1.5 pr-4 pl-10 text-xs text-zinc-500" colSpan={2}>
            a partir de {step.fromMonth}
          </td>
          <td className="py-1.5 pr-4 text-right text-xs">
            <Amount cents={step.amount} signed />
          </td>
          <td colSpan={3} />
        </tr>
      ))}
    </>
  );
}
