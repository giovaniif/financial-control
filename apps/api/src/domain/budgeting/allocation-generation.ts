import type { Bucket } from '../goals/bucket.js';
import { resolveAllocations } from '../goals/allocation.js';
import { Money } from '../shared/money.js';
import type { Cycle } from './cycle.js';
import { Estimates } from './cycle.js';
import { EntryKind, LedgerEntry, Origin } from './ledger-entry.js';

/**
 * Fills a cycle with what its allocation rules take from it.
 *
 * **Derived, not stored.** Unlike the template entries beside them, these are
 * recomputed on every read and never persisted. A rule is a statement about
 * every cycle it applies to, so a bucket moving from 20% to 25% has to change
 * what the future cycles say immediately — a persisted entry would go stale
 * and the rolling window, which never persists, would disagree with the cycle
 * view, which does.
 *
 * **A persisted allocation wins.** `ManageBuckets.allocate` writes real
 * entries when the rules are actually applied, and one of those may have been
 * settled or deliberately overridden for a single cycle (UC-6.5). A bucket
 * that already has an entry here is left alone, so nothing derived can
 * overwrite a decision the user made.
 *
 * Allocations apply to Expected Surplus, so the cycle must already hold the
 * template entries that produce it — call this after `generateInto`.
 */
export function allocateInto(cycle: Cycle, buckets: readonly Bucket[]): Cycle {
  if (cycle.isClosed) {
    return cycle;
  }

  const alreadyAllocated = new Set(
    cycle.entries.flatMap((entry) => bucketIdOf(entry)),
  );

  // Always the full reading: an allocation rule applies to the surplus the
  // cycle actually has, and a bucket does not receive less because a bill in
  // it is still a guess.
  const { expectedSurplus } = cycle.chain(Estimates.Included);
  const { fundings } = resolveAllocations(buckets, expectedSurplus);

  return fundings.reduce((filled, funding) => {
    const funded = Money.fromCents(funding.fundedCents);
    if (alreadyAllocated.has(funding.bucketId) || funded.isZero()) {
      return filled;
    }

    return filled.addEntry(
      LedgerEntry.create({
        id: `alloc-${funding.bucketId}@${cycle.ref.month}`,
        description: `→ ${funding.name}`,
        kind: EntryKind.Allocation,
        // The last day of the cycle: what is left over is only known once
        // everything else in it has happened.
        dueDate: cycle.ref.end,
        planned: funded.negate(),
        origin: Origin.fromAllocation(funding.bucketId),
      }),
    );
  }, cycle);
}

function bucketIdOf(entry: LedgerEntry): string[] {
  const origin =
    entry.origin.kind === 'OVERRIDE' ? entry.origin.original : entry.origin;

  return origin.kind === 'FROM_ALLOCATION' ? [origin.bucketId] : [];
}
