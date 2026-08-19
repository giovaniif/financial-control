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
    <Card label="Retirement" className="flex flex-col gap-1">
      <CardTitle>Retirement</CardTitle>
      <p className="text-sm">
        In 30 years {retirement.name} holds{' '}
        <Amount cents={retirement.balanceAtHorizon} className="font-semibold" />
        , which sustains{' '}
        <Amount
          cents={retirement.sustainableMonthlyIncome}
          className="font-semibold"
        />{' '}
        a month.
      </p>
      <p className="text-xs text-zinc-500">
        At a 4% withdrawal rate. An assumption, like every yield here.
      </p>
    </Card>
  );
}
