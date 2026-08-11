import { describe, expect, it } from 'vitest';

import { LocalDate } from '../shared/local-date.js';
import { Money } from '../shared/money.js';
import { Percentage } from '../shared/percentage.js';
import { resolveAllocations } from './allocation.js';
import { InvalidBucketEvent } from './bucket-event.js';
import {
  Allocation,
  Bucket,
  BucketMode,
  BucketStatus,
  InvalidBucket,
  WithdrawalTooLarge,
} from './bucket.js';

const reais = (amount: number) => Money.fromCents(Math.round(amount * 100));
const date = (iso: string) => LocalDate.parse(iso);

const reserve = (overrides: Partial<Parameters<typeof Bucket.goal>[0]> = {}) =>
  Bucket.goal({
    id: 'reserve',
    name: 'Reserve',
    target: { amount: reais(60_000), date: date('2027-12-31') },
    rule: Allocation.percentOfExpectedSurplus(Percentage.ofPercent(20)),
    priority: 1,
    ...overrides,
  });

const investments = (
  overrides: Partial<Parameters<typeof Bucket.ongoing>[0]> = {},
) =>
  Bucket.ongoing({
    id: 'investments',
    name: 'Investments',
    rule: Allocation.percentOfExpectedSurplus(Percentage.ofPercent(10)),
    priority: 3,
    ...overrides,
  });

describe('Bucket mode is an invariant, not a display flag', () => {
  it('makes a goal carry a target and a target date', () => {
    const bucket = reserve();

    expect(bucket.mode).toBe(BucketMode.Goal);
    expect(bucket.target?.amount.cents).toBe(6_000_000);
  });

  it('leaves an ongoing bucket with no target at all', () => {
    expect(investments().target).toBeUndefined();
  });

  // Reporting progress toward a target that does not exist is the bug this
  // whole distinction prevents.
  it('reports no percentage complete for an ongoing bucket', () => {
    expect(investments().percentComplete).toBeUndefined();
  });

  it('rejects a goal with no target at all', () => {
    expect(() =>
      Bucket.goal({
        id: 'x',
        name: 'Nameless goal',
        rule: Allocation.fixed(reais(1)),
        priority: 1,
      } as unknown as Parameters<typeof Bucket.goal>[0]),
    ).toThrow(InvalidBucket);
  });

  // An ongoing bucket has nothing to complete, so a target is a contradiction.
  it('rejects an ongoing bucket carrying a target', () => {
    expect(() =>
      Bucket.ongoing({
        id: 'x',
        name: 'Contradiction',
        target: { amount: reais(100), date: date('2027-01-01') },
        rule: Allocation.fixed(reais(1)),
        priority: 1,
      } as unknown as Parameters<typeof Bucket.ongoing>[0]),
    ).toThrow(InvalidBucket);
  });

  it('knows which kind it is', () => {
    expect(reserve().isGoal).toBe(true);
    expect(investments().isGoal).toBe(false);
  });

  it('rejects a blank name', () => {
    expect(() => reserve({ name: '  ' })).toThrow(InvalidBucket);
  });

  it('rejects a goal whose target is nothing', () => {
    expect(() =>
      reserve({ target: { amount: reais(0), date: date('2027-12-31') } }),
    ).toThrow(InvalidBucket);
  });

  it.each([0, -1, 1.5])('rejects a priority of %s', (priority) => {
    expect(() => reserve({ priority })).toThrow(InvalidBucket);
  });
});

describe('the balance is a fold over the event log', () => {
  it('starts at nothing', () => {
    expect(reserve().balance.isZero()).toBe(true);
  });

  it('adds each contribution', () => {
    const bucket = reserve()
      .contribute('e1', '2026-08', reais(1_778))
      .contribute('e2', '2026-09', reais(1_778));

    expect(bucket.balance.cents).toBe(355_600);
  });

  it('adds yield without counting it as saving', () => {
    const bucket = reserve()
      .contribute('e1', '2026-08', reais(1_000))
      .recordYield('e2', date('2026-08-31'), reais(13.5));

    expect(bucket.balance.cents).toBe(101_350);
    expect(bucket.contributed.cents).toBe(100_000);
    expect(bucket.yielded.cents).toBe(1_350);
  });

  // The spreadsheet could not tell a deposit from accrued interest.
  it('separates growth from saving and growth from returns', () => {
    const bucket = reserve()
      .contribute('e1', '2026-08', reais(1_000))
      .recordYield('e2', date('2026-08-31'), reais(10))
      .recordYield('e3', date('2026-09-30'), reais(10));

    expect(bucket.yielded.cents).toBe(2_000);
    expect(bucket.contributed.cents).toBe(100_000);
  });

  it('sets the balance outright on a correction', () => {
    const bucket = reserve()
      .contribute('e1', '2026-08', reais(1_000))
      .correctBalance(
        'e2',
        date('2026-09-01'),
        reais(840.2),
        'statement differed',
      );

    expect(bucket.balance.cents).toBe(84_020);
  });

  // The specific thing the spreadsheet did silently.
  it('refuses a correction with no reason', () => {
    expect(() =>
      reserve().correctBalance('e1', date('2026-09-01'), reais(100), '  '),
    ).toThrow(InvalidBucketEvent);
  });

  it('takes a withdrawal out, with a reason', () => {
    const bucket = reserve()
      .contribute('e1', '2026-08', reais(1_000))
      .withdraw('e2', date('2026-09-01'), reais(200), 'emergency');

    expect(bucket.balance.cents).toBe(80_000);
  });

  it('refuses a withdrawal with no reason', () => {
    expect(() =>
      reserve().withdraw('e1', date('2026-09-01'), reais(1), ''),
    ).toThrow(InvalidBucketEvent);
  });

  it('refuses a withdrawal that would drive the balance below zero', () => {
    const bucket = reserve().contribute('e1', '2026-08', reais(100));

    expect(() =>
      bucket.withdraw('e2', date('2026-09-01'), reais(200), 'too much'),
    ).toThrow(WithdrawalTooLarge);
  });

  it('refuses a negative contribution', () => {
    expect(() => reserve().contribute('e1', '2026-08', reais(-1))).toThrow(
      InvalidBucketEvent,
    );
  });

  it('keeps every event in order', () => {
    const bucket = reserve()
      .contribute('e1', '2026-08', reais(100))
      .recordYield('e2', date('2026-08-31'), reais(1))
      .withdraw('e3', date('2026-09-01'), reais(50), 'spent');

    expect(bucket.events.map((e) => e.kind)).toEqual([
      'CONTRIBUTION',
      'YIELD',
      'WITHDRAWAL',
    ]);
  });
});

describe('Bucket overrides', () => {
  // The rule is a default, not a constraint.
  it('records what the rule would have said alongside the override', () => {
    const bucket = reserve().overrideContribution(
      'e1',
      '2026-08',
      reais(7_000),
      reais(1_778),
    );
    const [event] = bucket.events;

    expect(bucket.balance.cents).toBe(700_000);
    expect(event?.kind === 'OVERRIDE' && event.ruleWouldHaveBeen.cents).toBe(
      177_800,
    );
  });

  it('reports the contribution recorded for a cycle', () => {
    const bucket = reserve().contribute('e1', '2026-08', reais(1_778));

    expect(bucket.contributionFor('2026-08')?.cents).toBe(177_800);
    expect(bucket.contributionFor('2026-09')).toBeUndefined();
  });
});

describe('Bucket goal progress', () => {
  it('reports how far along a goal is', () => {
    const bucket = reserve().contribute('e1', '2026-08', reais(30_000));

    expect(bucket.percentComplete).toBe(50);
  });

  it('caps a goal at 100 % once it is met', () => {
    const bucket = reserve().contribute('e1', '2026-08', reais(90_000));

    expect(bucket.percentComplete).toBe(100);
    expect(bucket.isComplete).toBe(true);
  });

  it('is not complete while it is short', () => {
    expect(reserve().isComplete).toBe(false);
  });

  it('has no completion for an ongoing bucket', () => {
    expect(investments().isComplete).toBe(false);
  });
});

describe('Bucket configuration', () => {
  it('changes the rule going forward', () => {
    const bucket = reserve().changeRule(Allocation.fixed(reais(2_000)));

    expect(bucket.requestFor(reais(10_000)).cents).toBe(200_000);
  });

  it('changes the priority', () => {
    expect(reserve().changePriority(4).priority).toBe(4);
  });

  it('rejects an invalid priority', () => {
    expect(() => reserve().changePriority(0)).toThrow(InvalidBucket);
  });

  it('carries an expected yield as the assumption it is', () => {
    const bucket = reserve().setExpectedYield(Percentage.ofPercent(10));

    expect(bucket.expectedYield?.percent).toBe(10);
  });

  it('archives while keeping the whole history', () => {
    const bucket = reserve()
      .contribute('e1', '2026-08', reais(1_000))
      .archive();

    expect(bucket.status).toBe(BucketStatus.Archived);
    expect(bucket.isArchived).toBe(true);
    expect(bucket.events).toHaveLength(1);
    expect(bucket.balance.cents).toBe(100_000);
  });
});

describe('Bucket.requestFor', () => {
  it('takes its percentage of the surplus', () => {
    expect(reserve().requestFor(reais(8_890)).cents).toBe(177_800);
  });

  it('takes a fixed amount whatever the surplus', () => {
    const apartment = investments({
      rule: Allocation.fixed(reais(3_457.67)),
    });

    expect(apartment.requestFor(reais(8_890)).cents).toBe(345_767);
  });

  // A negative Expected Surplus must never produce a negative contribution.
  it.each([0, -1_000])('asks for nothing when the surplus is %s', (amount) => {
    expect(reserve().requestFor(reais(amount)).isZero()).toBe(true);
    expect(
      investments({ rule: Allocation.fixed(reais(500)) })
        .requestFor(reais(amount))
        .isZero(),
    ).toBe(true);
  });
});

describe('resolveAllocations', () => {
  const buckets = () => [
    reserve(),
    investments({
      id: 'apartment',
      name: 'Apartment',
      rule: Allocation.fixed(reais(1_778)),
      priority: 2,
    }),
    investments(),
  ];

  it('funds everything when the surplus covers it', () => {
    const result = resolveAllocations(buckets(), reais(10_000));

    expect(result.totalFunded.cents).toBe(200_000 + 177_800 + 100_000);
    expect(result.isOvercommitted).toBe(false);
    expect(result.fundings.every((f) => f.isFullyFunded)).toBe(true);
  });

  // Lowest priority number first, and the last one funded may get a part.
  it('funds in priority order and reports the shortfall', () => {
    const result = resolveAllocations(buckets(), reais(2_000));

    expect(result.fundings.map((f) => f.fundedCents)).toEqual([
      40_000, 160_000, 0,
    ]);
    expect(result.isOvercommitted).toBe(true);
    // Asked for 40.000 + 177.800 + 20.000; only 200.000 was there.
    expect(result.totalRequested.cents).toBe(237_800);
    expect(result.shortfall.cents).toBe(37_800);
  });

  it('names which buckets the priority order would actually fund', () => {
    const result = resolveAllocations(buckets(), reais(2_000));

    expect(
      result.fundings.filter((f) => f.fundedCents > 0).map((f) => f.name),
    ).toEqual(['Reserve', 'Apartment']);
  });

  it('funds nothing at all when the surplus is negative', () => {
    const result = resolveAllocations(buckets(), reais(-500));

    expect(result.totalFunded.isZero()).toBe(true);
    expect(result.fundings.every((f) => f.fundedCents === 0)).toBe(true);
  });

  it('leaves archived buckets out entirely', () => {
    const result = resolveAllocations(
      [reserve().archive(), investments()],
      reais(10_000),
    );

    expect(result.fundings).toHaveLength(1);
    expect(result.fundings[0]?.name).toBe('Investments');
  });

  it('allocates nothing when there are no buckets', () => {
    const result = resolveAllocations([], reais(10_000));

    expect(result.totalFunded.isZero()).toBe(true);
    expect(result.isOvercommitted).toBe(false);
  });
});
