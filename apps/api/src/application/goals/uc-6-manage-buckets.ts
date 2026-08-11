import { CycleRef } from '../../domain/budgeting/cycle-ref.js';
import { Cycle, Estimates } from '../../domain/budgeting/cycle.js';
import {
  EntryKind,
  LedgerEntry,
  Origin,
} from '../../domain/budgeting/ledger-entry.js';
import type { AllocationResult } from '../../domain/goals/allocation.js';
import { resolveAllocations } from '../../domain/goals/allocation.js';
import type {
  AllocationRule,
  BucketMode,
  BucketStatus,
} from '../../domain/goals/bucket.js';
import { Allocation, Bucket } from '../../domain/goals/bucket.js';
import type { HolidayCalendar } from '../../domain/ports/holiday-calendar.js';
import type {
  BucketRepository,
  CycleRepository,
  SettingsRepository,
} from '../../domain/ports/repositories.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import { LocalDate } from '../../domain/shared/local-date.js';
import { Money } from '../../domain/shared/money.js';
import { Percentage } from '../../domain/shared/percentage.js';

export class BucketNotFound extends DomainError {}

export interface BucketEventView {
  readonly id: string;
  readonly kind: string;
  readonly when: string;
  readonly amountCents: number;
  readonly reason: string | undefined;
  readonly ruleWouldHaveBeenCents: number | undefined;
}

export interface BucketView {
  readonly id: string;
  readonly name: string;
  readonly purpose: string;
  readonly mode: BucketMode;
  readonly status: BucketStatus;
  readonly priority: number;
  readonly balanceCents: number;
  readonly contributedCents: number;
  readonly yieldedCents: number;
  readonly targetCents: number | undefined;
  readonly targetDate: string | undefined;
  /** Undefined for an ongoing bucket: there is no target to be part-way to. */
  readonly percentComplete: number | undefined;
  readonly rule:
    | { kind: 'PERCENT'; percent: number }
    | { kind: 'FIXED'; amountCents: number };
  readonly expectedYieldPercent: number | undefined;
  readonly events: readonly BucketEventView[];
}

export interface AllocationPreview {
  readonly month: string;
  readonly expectedSurplusCents: number;
  readonly fundings: AllocationResult['fundings'];
  readonly shortfallCents: number;
  readonly isOvercommitted: boolean;
}

/** UC-6 — buckets, their rules, and the money they take from each cycle. */
export class ManageBuckets {
  constructor(
    private readonly buckets: BucketRepository,
    private readonly cycles: CycleRepository,
    private readonly settings: SettingsRepository,
    private readonly holidays: HolidayCalendar,
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  async list(): Promise<readonly BucketView[]> {
    const buckets = await this.buckets.findAll();

    return buckets.map(toView);
  }

  async createGoal(input: {
    name: string;
    purpose?: string;
    targetCents: number;
    targetDate: string;
    rule:
      | { kind: 'PERCENT'; percent: number }
      | { kind: 'FIXED'; amountCents: number };
    priority: number;
  }): Promise<BucketView> {
    const bucket = Bucket.goal({
      id: this.newId(),
      name: input.name,
      ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
      target: {
        amount: Money.fromCents(input.targetCents),
        date: LocalDate.parse(input.targetDate),
      },
      rule: toRule(input.rule),
      priority: input.priority,
    });

    await this.buckets.save(bucket);
    return toView(bucket);
  }

  async createOngoing(input: {
    name: string;
    purpose?: string;
    rule:
      | { kind: 'PERCENT'; percent: number }
      | { kind: 'FIXED'; amountCents: number };
    priority: number;
  }): Promise<BucketView> {
    const bucket = Bucket.ongoing({
      id: this.newId(),
      name: input.name,
      ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
      rule: toRule(input.rule),
      priority: input.priority,
    });

    await this.buckets.save(bucket);
    return toView(bucket);
  }

  async changeRule(
    id: string,
    rule:
      | { kind: 'PERCENT'; percent: number }
      | { kind: 'FIXED'; amountCents: number },
  ): Promise<BucketView> {
    return this.update(id, (bucket) => bucket.changeRule(toRule(rule)));
  }

  async changePriority(id: string, priority: number): Promise<BucketView> {
    return this.update(id, (bucket) => bucket.changePriority(priority));
  }

  async setExpectedYield(id: string, percent: number): Promise<BucketView> {
    return this.update(id, (bucket) =>
      bucket.setExpectedYield(Percentage.ofPercent(percent)),
    );
  }

  async archive(id: string): Promise<BucketView> {
    return this.update(id, (bucket) => bucket.archive());
  }

  async recordYield(
    id: string,
    date: string,
    amountCents: number,
  ): Promise<BucketView> {
    return this.update(id, (bucket) =>
      bucket.recordYield(
        this.newId(),
        LocalDate.parse(date),
        Money.fromCents(amountCents),
      ),
    );
  }

  async correctBalance(
    id: string,
    date: string,
    newBalanceCents: number,
    reason: string,
  ): Promise<BucketView> {
    return this.update(id, (bucket) =>
      bucket.correctBalance(
        this.newId(),
        LocalDate.parse(date),
        Money.fromCents(newBalanceCents),
        reason,
      ),
    );
  }

  async withdraw(
    id: string,
    date: string,
    amountCents: number,
    reason: string,
  ): Promise<BucketView> {
    return this.update(id, (bucket) =>
      bucket.withdraw(
        this.newId(),
        LocalDate.parse(date),
        Money.fromCents(amountCents),
        reason,
      ),
    );
  }

  /** Puts a different amount in this once, without changing the rule. */
  async overrideContribution(
    id: string,
    month: string,
    amountCents: number,
  ): Promise<BucketView> {
    const expectedSurplus = await this.expectedSurplusOf(month);

    return this.update(id, (bucket) =>
      bucket.overrideContribution(
        this.newId(),
        month,
        Money.fromCents(amountCents),
        bucket.requestFor(expectedSurplus),
      ),
    );
  }

  /** What the rules would take from a cycle, without taking anything. */
  async previewAllocation(month: string): Promise<AllocationPreview> {
    const expectedSurplus = await this.expectedSurplusOf(month);
    const result = resolveAllocations(
      await this.buckets.findAll(),
      expectedSurplus,
    );

    return {
      month,
      expectedSurplusCents: expectedSurplus.cents,
      fundings: result.fundings,
      shortfallCents: result.shortfall.cents,
      isOvercommitted: result.isOvercommitted,
    };
  }

  /**
   * Runs the rules for a cycle: records a contribution on each funded bucket
   * and writes the matching `ALLOCATION` entries into the ledger.
   *
   * A bucket that already has a contribution for the cycle is left alone, so
   * running this twice does not double-contribute.
   */
  async allocate(month: string): Promise<AllocationPreview> {
    const preview = await this.previewAllocation(month);
    const ref = await this.refFor(month);
    const stored = await this.cycles.findByMonth(ref);

    if (stored === undefined || stored.isClosed) {
      return preview;
    }

    let cycle = stored;
    for (const funding of preview.fundings) {
      const bucket = await this.buckets.findById(funding.bucketId);
      if (bucket === undefined || bucket.contributionFor(month) !== undefined) {
        continue;
      }

      const amount = Money.fromCents(funding.fundedCents);
      await this.buckets.save(bucket.contribute(this.newId(), month, amount));

      // Outgoing in the ledger: an allocation leaves the free cash.
      cycle = cycle.addEntry(
        LedgerEntry.create({
          id: `alloc-${bucket.id}@${month}`,
          description: `→ ${bucket.name}`,
          kind: EntryKind.Allocation,
          dueDate: ref.end,
          planned: amount.negate(),
          origin: Origin.fromAllocation(bucket.id),
        }),
      );
    }

    await this.cycles.save(cycle);
    return preview;
  }

  async delete(id: string): Promise<void> {
    await this.require(id);
    await this.buckets.delete(id);
  }

  /** Expected Surplus before allocations, which is what the rules apply to. */
  private async expectedSurplusOf(month: string): Promise<Money> {
    const ref = await this.refFor(month);
    const cycle =
      (await this.cycles.findByMonth(ref)) ??
      Cycle.open({ id: month, ref, openingBalance: Money.zero() });

    return cycle.chain(Estimates.Included).expectedSurplus;
  }

  private async refFor(month: string): Promise<CycleRef> {
    return CycleRef.forMonth(month, await this.settings.load(), this.holidays);
  }

  private async update(
    id: string,
    change: (bucket: Bucket) => Bucket,
  ): Promise<BucketView> {
    const changed = change(await this.require(id));
    await this.buckets.save(changed);

    return toView(changed);
  }

  private async require(id: string): Promise<Bucket> {
    const bucket = await this.buckets.findById(id);
    if (bucket === undefined) {
      throw new BucketNotFound(`No bucket ${id}.`);
    }
    return bucket;
  }
}

function toRule(
  rule:
    | { kind: 'PERCENT'; percent: number }
    | { kind: 'FIXED'; amountCents: number },
): AllocationRule {
  return rule.kind === 'PERCENT'
    ? Allocation.percentOfExpectedSurplus(Percentage.ofPercent(rule.percent))
    : Allocation.fixed(Money.fromCents(rule.amountCents));
}

function toView(bucket: Bucket): BucketView {
  return {
    id: bucket.id,
    name: bucket.name,
    purpose: bucket.purpose,
    mode: bucket.mode,
    status: bucket.status,
    priority: bucket.priority,
    balanceCents: bucket.balance.cents,
    contributedCents: bucket.contributed.cents,
    yieldedCents: bucket.yielded.cents,
    targetCents: bucket.target?.amount.cents,
    targetDate: bucket.target?.date.toISO(),
    percentComplete: bucket.percentComplete,
    rule:
      bucket.rule.kind === 'PERCENT'
        ? { kind: 'PERCENT', percent: bucket.rule.percentage.percent }
        : { kind: 'FIXED', amountCents: bucket.rule.amount.cents },
    expectedYieldPercent: bucket.expectedYield?.percent,
    events: bucket.events.map((event) => ({
      id: event.id,
      kind: event.kind,
      when:
        event.kind === 'CONTRIBUTION' || event.kind === 'OVERRIDE'
          ? event.cycleMonth
          : event.date.toISO(),
      amountCents:
        event.kind === 'CORRECTION'
          ? event.newBalance.cents
          : event.amount.cents,
      reason:
        event.kind === 'CORRECTION' || event.kind === 'WITHDRAWAL'
          ? event.reason
          : undefined,
      ruleWouldHaveBeenCents:
        event.kind === 'OVERRIDE' ? event.ruleWouldHaveBeen.cents : undefined,
    })),
  };
}
