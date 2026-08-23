import { useBuckets } from '@/entities/bucket';
import { CreateBucketButton } from '@/features/create-bucket';
import { formatBRL } from '@/shared/lib';
import { Amount, Badge, Skeleton } from '@/shared/ui';

const BUCKET_MODE_LABELS: Record<'GOAL' | 'ONGOING', string> = {
  GOAL: 'meta',
  ONGOING: 'contínua',
};

/** UC-6.1 / UC-6.2 — where the Expected Surplus goes each cycle. */
export function BucketsSection() {
  const { data, isPending } = useBuckets();
  const buckets = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 text-zinc-600">
        <p>
          O que sobra depois das contas é a{' '}
          <strong className="font-medium text-zinc-900">Sobra Esperada</strong>,
          e as caixinhas são para onde ela vai. Cada uma recebe uma parte
          automaticamente a cada ciclo.
        </p>
        <p>
          Uma caixinha é ou uma{' '}
          <strong className="font-medium text-zinc-900">meta</strong> — um valor
          objetivo até uma data objetivo, como seis meses de despesas até março
          que vem — ou{' '}
          <strong className="font-medium text-zinc-900">contínua</strong>, um
          compromisso por ciclo sem linha de chegada, como um aporte numa
          corretora. A distinção é real: perguntar a uma caixinha contínua o
          quanto ela está completa não tem resposta, então o app nunca finge que
          tem.
        </p>
      </div>

      {isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : buckets.length > 0 ? (
        <ul className="divide-y divide-zinc-100 text-sm">
          {buckets.map((bucket) => (
            <li key={bucket.id} className="flex items-center gap-3 py-1.5">
              <span className="flex-1">{bucket.name}</span>
              <Badge tone={bucket.mode === 'GOAL' ? 'info' : 'neutral'}>
                {BUCKET_MODE_LABELS[bucket.mode]}
              </Badge>
              <span className="text-xs text-zinc-500">
                {bucket.rule.kind === 'PERCENT'
                  ? `${String(bucket.rule.percent)}% por ciclo`
                  : `${formatBRL(bucket.rule.amount)} por ciclo`}
              </span>
              {bucket.target !== null && (
                <Amount cents={bucket.target} className="w-28 text-right" />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">
          Nenhuma caixinha ainda. Você pode adicioná-las depois, mas um ciclo
          sem caixinhas deixa toda a sobra como dinheiro livre.
        </p>
      )}

      <div>
        <CreateBucketButton existingCount={buckets.length} />
      </div>
    </div>
  );
}
