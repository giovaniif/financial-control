import type { RetirementResponse } from '@fin/contracts';

import { Amount, Card, CardTitle } from '@/shared/ui';

/**
 * UC-7.5 — retirement is measured in monthly income, not in a lump sum,
 * because that is the question actually being asked.
 */
export function RetirementCard({
  retirement,
}: {
  retirement: RetirementResponse;
}) {
  return (
    <Card label="Aposentadoria" className="flex flex-col gap-1">
      <CardTitle>Aposentadoria</CardTitle>
      <p className="text-sm">
        Em 30 anos {retirement.name} tem{' '}
        <Amount cents={retirement.balanceAtHorizon} className="font-semibold" />
        , o que sustenta{' '}
        <Amount
          cents={retirement.sustainableMonthlyIncome}
          className="font-semibold"
        />{' '}
        por mês.
      </p>
      <p className="text-xs text-zinc-500">
        A uma taxa de retirada de 4%. Uma premissa, como todo rendimento aqui.
      </p>
    </Card>
  );
}
