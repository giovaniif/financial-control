import type { BucketResponse, Cents } from '@fin/contracts';

export interface PlannedAgainstReal {
  /** What the allocation rules said should have accumulated. */
  planned: Cents;
  /** What the fold over the whole log says is actually there. */
  real: Cents;
  /** Real minus planned: positive is ahead, negative is behind. */
  gap: Cents;
}

/**
 * UC-6.6 — the two figures the spreadsheet could never show together, because
 * it wrote reality over its own running total. Here the rule's own number
 * survives on every override, so the plan is still readable next to the fact.
 */
export function plannedAgainstReal(
  bucket: Pick<BucketResponse, 'balance' | 'events'>,
): PlannedAgainstReal {
  const planned = bucket.events.reduce((total, event) => {
    if (event.kind === 'CONTRIBUTION') {
      return total + event.amount;
    }
    if (event.kind === 'OVERRIDE') {
      return total + (event.ruleWouldHaveBeen ?? event.amount);
    }

    return total;
  }, 0);

  return { planned, real: bucket.balance, gap: bucket.balance - planned };
}
