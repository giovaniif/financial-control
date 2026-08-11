import type { Bucket } from '../../domain/goals/bucket.js';
import { BucketStatus } from '../../domain/goals/bucket.js';
import type { BucketRepository } from '../../domain/ports/repositories.js';
import { Money } from '../../domain/shared/money.js';

/** Total net worth at one horizon, and what it is made of. */
export interface HorizonView {
  readonly years: number;
  readonly totalCents: number;
  readonly byBucket: readonly {
    bucketId: string;
    name: string;
    amountCents: number;
  }[];
}

export interface BucketProjectionView {
  readonly bucketId: string;
  readonly name: string;
  readonly isGoal: boolean;
  readonly contributionPerCycleCents: number;
  readonly expectedYieldPercent: number;
  /** GOAL only: when the balance reaches the target at the current rate. */
  readonly reachesTargetIn: number | undefined;
  readonly targetCents: number | undefined;
  readonly targetDate: string | undefined;
  readonly isOnTrack: boolean | undefined;
  /** GOAL only, and only when behind: the contribution that would fix it. */
  readonly contributionToCatchUpCents: number | undefined;
  /** ONGOING only: where the rate lands, with nothing to complete. */
  readonly inFiveYearsCents: number | undefined;
  readonly inTenYearsCents: number | undefined;
}

export interface RetirementView {
  readonly bucketId: string;
  readonly name: string;
  readonly balanceAtHorizonCents: number;
  /** What that balance sustains per month at a 4 % withdrawal rate. */
  readonly sustainableMonthlyIncomeCents: number;
}

export interface WealthProjectionView {
  readonly horizons: readonly HorizonView[];
  readonly buckets: readonly BucketProjectionView[];
  readonly retirement: RetirementView | undefined;
}

const HORIZONS = [5, 10, 20, 30] as const;
const CYCLES_PER_YEAR = 12;

/** The rule of thumb for what a pot sustains indefinitely. */
const SAFE_WITHDRAWAL_RATE = 0.04;

/** How far ahead a goal is chased before it is called unreachable. */
const MAX_CYCLES = 12 * 60;

/**
 * UC-7 — where the current savings rate lands in 5, 10, 20 and 30 years.
 *
 * Deliberately coarser than the ledger: it models buckets only, never
 * individual bills, and every yield it uses is an assumption the UI must
 * label as one.
 */
export class ProjectWealth {
  constructor(
    private readonly buckets: BucketRepository,
    /** Named so the retirement figure can be picked out of the list. */
    private readonly retirementBucketName = 'Retirement',
  ) {}

  async project(input: {
    /** What each bucket contributes per cycle, from the allocation rules. */
    contributionsCents: Record<string, number>;
    /** Overrides the stored yield, for testing an assumption. */
    yieldOverrides?: Record<string, number>;
  }): Promise<WealthProjectionView> {
    const live = (await this.buckets.findAll()).filter(
      (bucket) => bucket.status === BucketStatus.Active,
    );

    const projections = live.map((bucket) =>
      this.projectBucket(
        bucket,
        input.contributionsCents[bucket.id] ?? 0,
        input.yieldOverrides?.[bucket.id],
      ),
    );

    const horizons = HORIZONS.map((years) => {
      const byBucket = live.map((bucket) => ({
        bucketId: bucket.id,
        name: bucket.name,
        amountCents: futureValue(
          bucket.balance,
          input.contributionsCents[bucket.id] ?? 0,
          yieldOf(bucket, input.yieldOverrides?.[bucket.id]),
          years * CYCLES_PER_YEAR,
        ).cents,
      }));

      return {
        years,
        totalCents: byBucket.reduce((sum, entry) => sum + entry.amountCents, 0),
        byBucket,
      };
    });

    return {
      horizons,
      buckets: projections,
      retirement: this.retirementOf(live, horizons),
    };
  }

  private projectBucket(
    bucket: Bucket,
    contributionCents: number,
    yieldOverride: number | undefined,
  ): BucketProjectionView {
    const rate = yieldOf(bucket, yieldOverride);
    const shared = {
      bucketId: bucket.id,
      name: bucket.name,
      isGoal: bucket.isGoal,
      contributionPerCycleCents: contributionCents,
      expectedYieldPercent: rate * 100,
    };

    if (bucket.target === undefined) {
      return {
        ...shared,
        reachesTargetIn: undefined,
        targetCents: undefined,
        targetDate: undefined,
        isOnTrack: undefined,
        contributionToCatchUpCents: undefined,
        inFiveYearsCents: futureValue(
          bucket.balance,
          contributionCents,
          rate,
          5 * CYCLES_PER_YEAR,
        ).cents,
        inTenYearsCents: futureValue(
          bucket.balance,
          contributionCents,
          rate,
          10 * CYCLES_PER_YEAR,
        ).cents,
      };
    }

    const cycles = cyclesToReach(
      bucket.balance,
      contributionCents,
      rate,
      bucket.target.amount,
    );

    return {
      ...shared,
      reachesTargetIn: cycles,
      targetCents: bucket.target.amount.cents,
      targetDate: bucket.target.date.toISO(),
      isOnTrack: cycles !== undefined,
      contributionToCatchUpCents:
        cycles === undefined
          ? catchUpContribution(bucket.balance, rate, bucket.target.amount)
          : undefined,
      inFiveYearsCents: undefined,
      inTenYearsCents: undefined,
    };
  }

  private retirementOf(
    buckets: readonly Bucket[],
    horizons: readonly HorizonView[],
  ): RetirementView | undefined {
    const bucket = buckets.find(
      (candidate) => candidate.name === this.retirementBucketName,
    );
    if (bucket === undefined) {
      return undefined;
    }

    const atThirty = horizons
      .find((horizon) => horizon.years === 30)
      ?.byBucket.find((entry) => entry.bucketId === bucket.id);
    const balance = atThirty?.amountCents ?? 0;

    return {
      bucketId: bucket.id,
      name: bucket.name,
      balanceAtHorizonCents: balance,
      // Retirement is measured in monthly income, not in a lump sum: that is
      // the question actually being asked.
      sustainableMonthlyIncomeCents: Math.round(
        (balance * SAFE_WITHDRAWAL_RATE) / 12,
      ),
    };
  }
}

function yieldOf(bucket: Bucket, override: number | undefined): number {
  if (override !== undefined) {
    return override / 100;
  }
  return (bucket.expectedYield?.percent ?? 0) / 100;
}

/**
 * Compounds a balance forward, adding a contribution each cycle. The annual
 * rate is spread across the twelve cycles rather than applied once a year,
 * because contributions land monthly.
 */
function futureValue(
  balance: Money,
  contributionCents: number,
  annualRate: number,
  cycles: number,
): Money {
  const perCycle = annualRate / CYCLES_PER_YEAR;
  let total = balance.cents;

  for (let cycle = 0; cycle < cycles; cycle += 1) {
    total = total * (1 + perCycle) + contributionCents;
  }
  return Money.fromCents(Math.round(total));
}

/** How many cycles until the balance reaches a target, if it ever does. */
function cyclesToReach(
  balance: Money,
  contributionCents: number,
  annualRate: number,
  target: Money,
): number | undefined {
  if (!balance.isLessThan(target)) {
    return 0;
  }
  if (contributionCents <= 0 && annualRate <= 0) {
    return undefined;
  }

  const perCycle = annualRate / CYCLES_PER_YEAR;
  let total = balance.cents;

  for (let cycle = 1; cycle <= MAX_CYCLES; cycle += 1) {
    total = total * (1 + perCycle) + contributionCents;
    if (total >= target.cents) {
      return cycle;
    }
  }
  return undefined;
}

/** A flat contribution that would reach the target within thirty years. */
function catchUpContribution(
  balance: Money,
  annualRate: number,
  target: Money,
): number {
  const cycles = 30 * CYCLES_PER_YEAR;
  const perCycle = annualRate / CYCLES_PER_YEAR;

  if (perCycle === 0) {
    return Math.ceil((target.cents - balance.cents) / cycles);
  }

  // The future value of an annuity, solved for the payment.
  const growth = (1 + perCycle) ** cycles;
  const needed = target.cents - balance.cents * growth;

  return Math.max(0, Math.ceil((needed * perCycle) / (growth - 1)));
}
