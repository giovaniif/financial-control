import type { AllocationPreviewResponse } from '@fin/contracts';

import { useAllocationPreview } from '@/features/manage-buckets';
import { formatBRL, formatMonthLabel } from '@/shared/lib';
import { Amount, Card, CardTitle, Skeleton } from '@/shared/ui';

/**
 * UC-6.3 and UC-6.4 — what the rules ask of this cycle, what the priority
 * order actually funds, and the shortfall said out loud rather than left to be
 * inferred from a number that quietly came out smaller.
 */
export function AllocationSection({ month }: { month: string }) {
  const { data } = useAllocationPreview(month);

  if (data === undefined) {
    return <Skeleton className="h-24 w-full" />;
  }

  const label = formatMonthLabel(month);

  return (
    <Card label="Alocação neste ciclo" className="flex flex-col gap-3">
      <CardTitle>Alocação neste ciclo</CardTitle>

      <p className="text-sm text-zinc-600">
        {label} tem <Amount cents={data.expectedSurplus} /> de Sobra Esperada
        para alocar.
      </p>

      <Warning preview={data} label={label} />

      {data.fundings.length === 0 ? (
        <p className="text-xs text-zinc-500">
          Nenhuma caixinha tem uma regra que financia a partir deste ciclo
          ainda.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100 text-sm">
          {data.fundings.map((funding, index) => (
            <li key={funding.bucketId} className="flex items-center gap-3 py-2">
              {/* Lowest first: the order decides who is paid when money runs short. */}
              <span className="w-16 shrink-0 font-mono text-xs text-zinc-500">
                #{index + 1} de {data.fundings.length}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-zinc-600">
                {funding.name} pede {formatBRL(funding.requested)}, recebe{' '}
                {formatBRL(funding.funded)}
              </span>
              <Amount cents={funding.funded} className="w-28 text-right" />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Warning({
  preview,
  label,
}: {
  preview: AllocationPreviewResponse;
  label: string;
}) {
  // A negative Expected Surplus is a different problem from an overcommitted
  // one, and is handled explicitly: nothing is contributed, and no bucket is
  // ever asked to give money back.
  if (preview.expectedSurplus <= 0) {
    return (
      <p
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900"
      >
        {label} não tem Sobra Esperada para alocar. Nada é aportado neste ciclo,
        em vez de um valor negativo retirado das caixinhas.
      </p>
    );
  }

  if (!preview.isOvercommitted) {
    return null;
  }

  return (
    <div
      role="alert"
      className="flex flex-col gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
    >
      <span>
        Falta {formatBRL(preview.shortfall)} para cobrir as regras em {label}. A
        ordem de prioridade financia:
      </span>
      <ul className="list-disc pl-4">
        {preview.fundings.map((funding) => (
          <li key={funding.bucketId}>
            {funding.funded === 0
              ? `${funding.name} não recebe nada`
              : `${funding.name} recebe ${formatBRL(funding.funded)}${
                  funding.isFullyFunded ? '' : ' — não tudo o que pediu'
                }`}
          </li>
        ))}
      </ul>
    </div>
  );
}
