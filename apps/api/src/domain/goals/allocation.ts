import { Money } from '../shared/money.js';
import type { Bucket } from './bucket.js';
import { BucketStatus } from './bucket.js';

/** What one bucket asked for, and what it actually gets. */
export interface Funding {
  readonly bucketId: string;
  readonly name: string;
  readonly requestedCents: number;
  readonly fundedCents: number;
  readonly isFullyFunded: boolean;
}

export interface AllocationResult {
  readonly fundings: readonly Funding[];
  readonly totalRequested: Money;
  readonly totalFunded: Money;
  /** Positive when the rules ask for more than the surplus holds. */
  readonly shortfall: Money;
  readonly isOvercommitted: boolean;
}

/**
 * Resolves every active bucket's claim on one cycle's Expected Surplus.
 *
 * Funds in priority order, lowest number first, and stops when the money runs
 * out — the last bucket funded may get only part of what it asked for. A
 * negative or zero Expected Surplus funds nothing at all: a negative
 * contribution is not a thing, and silently producing one is the failure this
 * prevents.
 */
export function resolveAllocations(
  buckets: readonly Bucket[],
  expectedSurplus: Money,
): AllocationResult {
  const active = [...buckets]
    .filter((bucket) => bucket.status === BucketStatus.Active)
    .sort((a, b) => a.priority - b.priority);

  let remaining = expectedSurplus.isPositive() ? expectedSurplus : Money.zero();
  const fundings: Funding[] = [];

  for (const bucket of active) {
    const requested = bucket.requestFor(expectedSurplus);
    const funded = requested.isGreaterThan(remaining) ? remaining : requested;

    fundings.push({
      bucketId: bucket.id,
      name: bucket.name,
      requestedCents: requested.cents,
      fundedCents: funded.cents,
      isFullyFunded: funded.cents === requested.cents,
    });
    remaining = remaining.minus(funded);
  }

  const totalRequested = Money.fromCents(
    fundings.reduce((sum, funding) => sum + funding.requestedCents, 0),
  );
  const totalFunded = Money.fromCents(
    fundings.reduce((sum, funding) => sum + funding.fundedCents, 0),
  );
  const shortfall = totalRequested.minus(totalFunded);

  return {
    fundings,
    totalRequested,
    totalFunded,
    shortfall,
    isOvercommitted: shortfall.isPositive(),
  };
}
