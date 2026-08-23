import type { AnchorSettingsResponse } from '@fin/contracts';
import { useQuery } from '@tanstack/react-query';

import { ChangeAnchor } from '@/features/configure-anchor';
import { api, queryKeys } from '@/shared/api';
import { Card, CardTitle, Skeleton } from '@/shared/ui';

/** UC-1.1 — the day salary lands, and what happens when it lands on a Sunday. */
export function PaydayAnchor() {
  const { data, isPending } = useQuery({
    queryKey: queryKeys.anchor(),
    queryFn: () => api<AnchorSettingsResponse>('/settings/anchor'),
  });

  return (
    <Card label="Dia do pagamento" className="flex flex-col gap-3">
      <CardTitle>Dia do pagamento</CardTitle>
      {isPending || data === undefined ? (
        <Skeleton className="h-10 w-40" />
      ) : (
        <>
          <p className="text-sm">
            O salário cai no dia{' '}
            <strong className="font-mono">{data.anchorDay}</strong>, passando
            para o{' '}
            {data.shiftPolicy === 'PRECEDING'
              ? 'dia útil anterior'
              : 'dia útil seguinte'}{' '}
            quando isso cai num fim de semana ou feriado.
          </p>
          {/* Changing it re-slices every open cycle, so it is never silent. */}
          <p className="text-xs text-zinc-500">
            Alterar o dia do pagamento redefine os limites de todos os ciclos em
            aberto. Os ciclos fechados nunca são alterados, e a mudança é sempre
            pré-visualizada antes de ser aplicada.
          </p>
          <div>
            <ChangeAnchor
              anchorDay={data.anchorDay}
              shiftPolicy={data.shiftPolicy}
            />
          </div>
        </>
      )}
    </Card>
  );
}
