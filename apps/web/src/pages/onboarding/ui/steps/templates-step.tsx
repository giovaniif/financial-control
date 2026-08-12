import { useTemplates } from '@/entities/template';
import { CreateTemplateButton } from '@/features/manage-templates';
import { Amount, Badge, Skeleton } from '@/shared/ui';

interface Props {
  /** The cycle new templates start generating from. */
  currentMonth: string;
}

/** UC-2 — the engine that fills every projected cycle. */
export function TemplatesStep({ currentMonth }: Props) {
  const { data, isPending } = useTemplates();
  const templates = data?.templates ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 text-zinc-600">
        <p>
          Add the bills and income that repeat — rent, the health plan, the
          electricity, your salary. The app generates one entry per cycle from
          each of them, which is what makes a projected cycle a projection
          rather than a blank page.
        </p>
        <p>
          Every one needs a{' '}
          <strong className="font-medium text-zinc-900">due day</strong>. That
          is what lets the ledger carry a running balance through the cycle, so
          you can see cash bottom out on the 12th and recover by the 28th
          instead of only seeing a monthly total.
        </p>
        <p className="text-sm">
          Not sure of an amount? Add it anyway and mark it an{' '}
          <strong className="font-medium text-zinc-900">estimate</strong> — it
          stays tagged everywhere it appears, and every total can be read with
          or without the guesses.
        </p>
      </div>

      {isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : templates.length > 0 ? (
        <ul className="divide-y divide-zinc-100 text-sm">
          {templates.map((template) => (
            <li key={template.id} className="flex items-center gap-3 py-1.5">
              <span className="flex-1">{template.name}</span>
              {template.isEstimate && <Badge tone="warning">~estimate</Badge>}
              <Badge>day {template.dueDayOfMonth}</Badge>
              <Amount
                cents={template.amount}
                signed
                className="w-28 text-right"
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">
          No templates yet. You can always add the rest later.
        </p>
      )}

      <div>
        <CreateTemplateButton currentMonth={currentMonth} />
      </div>
    </div>
  );
}
