import { useTemplates } from '@/entities/template';
import { CreateTemplateButton } from '@/features/manage-templates';
import { Amount, Badge, Skeleton } from '@/shared/ui';

interface Props {
  /** The cycle new templates start generating from. */
  currentMonth: string;
}

/** UC-2 — the engine that fills every projected cycle. */
export function TemplatesSection({ currentMonth }: Props) {
  const { data, isPending } = useTemplates();
  const templates = data?.templates ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 text-zinc-600">
        <p>
          Adicione as contas e receitas que se repetem — aluguel, o plano de
          saúde, a energia, o seu salário. O app gera um lançamento por ciclo
          para cada uma, o que é o que faz um ciclo projetado ser uma projeção
          em vez de uma página em branco.
        </p>
        <p>
          Cada uma precisa de um{' '}
          <strong className="font-medium text-zinc-900">
            dia de vencimento
          </strong>
          . É isso que permite ao extrato carregar um saldo corrente ao longo do
          ciclo, para que você veja o caixa bater no fundo no dia 12 e se
          recuperar até o dia 28, em vez de ver só um total mensal.
        </p>
        <p className="text-sm">
          Não tem certeza de um valor? Adicione mesmo assim e marque como{' '}
          <strong className="font-medium text-zinc-900">estimativa</strong> —
          ela fica marcada em todo lugar em que aparece, e todo total pode ser
          lido com ou sem os chutes.
        </p>
      </div>

      {isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : templates.length > 0 ? (
        <ul className="divide-y divide-zinc-100 text-sm">
          {templates.map((template) => (
            <li key={template.id} className="flex items-center gap-3 py-1.5">
              <span className="flex-1">{template.name}</span>
              {template.isEstimate && <Badge tone="warning">~estimativa</Badge>}
              <Badge>dia {template.dueDayOfMonth}</Badge>
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
          Nenhuma conta ainda. Você sempre pode adicionar o resto depois.
        </p>
      )}

      <div>
        <CreateTemplateButton currentMonth={currentMonth} />
      </div>
    </div>
  );
}
