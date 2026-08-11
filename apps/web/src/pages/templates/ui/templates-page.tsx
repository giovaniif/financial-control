import type { TemplateResponse } from '@fin/contracts';

import { useTemplates } from '@/entities/template';
import {
  CreateTemplateButton,
  EditTemplate,
} from '@/features/manage-templates';
import { useSelectedCycle } from '@/features/navigate-cycle';
import { Amount, Badge, EmptyState, Skeleton, StatTile } from '@/shared/ui';
import { AppShell } from '@/widgets/app-shell';

const statusTones = {
  ACTIVE: 'positive',
  PAUSED: 'neutral',
  ENDED: 'neutral',
} as const;

/** UC-2 — the recurring commitments that fill every future cycle. */
export function TemplatesPage() {
  const { data, isPending } = useTemplates();
  // A change applies from the selected cycle onward, never behind it.
  const { selectedMonth } = useSelectedCycle();

  return (
    <AppShell
      title="Recurring Templates"
      subtitle="What repeats every cycle, and what it adds up to"
    >
      {isPending || data === undefined ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Fixed commitment / cycle"
              cents={-data.summary.fixedCommitment}
              note={`${String(data.summary.activeOutcomeCount)} active outcome templates`}
              signed
            />
            <StatTile
              label="Fixed income / cycle"
              cents={data.summary.fixedIncome}
              note="before any variables"
              signed
            />
            <StatTile
              label="Unconfirmed estimates"
              cents={-data.summary.unconfirmedEstimates}
              note="what you are still guessing at"
              signed
            />
            <StatTile
              label="Ending within 12 cycles"
              cents={0}
              note={
                data.summary.endingWithinTwelve.length === 0
                  ? 'nothing falls off'
                  : data.summary.endingWithinTwelve.join(', ')
              }
            />
          </div>

          <div className="flex items-center justify-end">
            <CreateTemplateButton currentMonth={selectedMonth ?? ''} />
          </div>

          {data.templates.length === 0 ? (
            <EmptyState
              title="No templates yet"
              body="A template generates one entry per cycle — salary, rent, a subscription. Every future cycle is built from these."
            />
          ) : (
            <TemplateTable
              templates={data.templates}
              currentMonth={selectedMonth ?? ''}
            />
          )}
        </div>
      )}
    </AppShell>
  );
}

function TemplateTable({
  templates,
  currentMonth,
}: {
  templates: TemplateResponse[];
  currentMonth: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-[10px] tracking-wider text-zinc-500 uppercase">
            <th className="px-4 py-2 font-semibold">Name</th>
            <th className="px-4 py-2 font-semibold">Due day</th>
            <th className="px-4 py-2 text-right font-semibold">Amount</th>
            <th className="px-4 py-2 font-semibold">Next</th>
            <th className="px-4 py-2 font-semibold">Status</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {templates.map((template) => (
            <TemplateRow
              key={template.id}
              template={template}
              currentMonth={currentMonth}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TemplateRow({
  template,
  currentMonth,
}: {
  template: TemplateResponse;
  currentMonth: string;
}) {
  const dimmed = template.status !== 'ACTIVE';

  return (
    <>
      <tr className={dimmed ? 'opacity-50' : undefined}>
        <td className="px-4 py-2">
          <span className="flex items-center gap-2">
            {template.name}
            {template.isEstimate && <Badge tone="warning">~estimate</Badge>}
            {template.valueSchedule.length > 0 && (
              <Badge tone="info">value schedule</Badge>
            )}
          </span>
        </td>
        <td className="px-4 py-2 font-mono text-xs text-zinc-500">
          day {template.dueDayOfMonth}
        </td>
        <td className="px-4 py-2 text-right">
          <Amount cents={template.amount} signed />
        </td>
        <td className="px-4 py-2 font-mono text-xs text-zinc-500">
          {template.nextOccurrenceMonth ?? '—'}
        </td>
        <td className="px-4 py-2">
          <Badge tone={statusTones[template.status]}>
            {template.endMonth === null
              ? template.status
              : `ends ${template.endMonth}`}
          </Badge>
        </td>
        <td className="px-4 py-2 text-right">
          <EditTemplate template={template} currentMonth={currentMonth} />
        </td>
      </tr>
      {/* UC-2.4 — the steps expand in place, so a climbing cost is legible. */}
      {template.valueSchedule.map((step) => (
        <tr key={`${template.id}-${step.fromMonth}`} className="bg-zinc-50/60">
          <td className="py-1.5 pr-4 pl-10 text-xs text-zinc-500" colSpan={2}>
            from {step.fromMonth}
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
