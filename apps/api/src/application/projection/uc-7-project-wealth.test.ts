import { describe, expect, it } from 'vitest';

import { Allocation, Bucket } from '../../domain/goals/bucket.js';
import { LocalDate } from '../../domain/shared/local-date.js';
import { Money } from '../../domain/shared/money.js';
import { Percentage } from '../../domain/shared/percentage.js';
import { InMemoryBucketRepository } from '../testing/fakes.js';
import { ProjectWealth } from './uc-7-project-wealth.js';

const reais = (amount: number) => Money.fromCents(Math.round(amount * 100));

const retirement = () =>
  Bucket.ongoing({
    id: 'retirement',
    name: 'Retirement',
    rule: Allocation.percentOfExpectedSurplus(Percentage.ofPercent(10)),
    priority: 4,
    expectedYield: Percentage.ofPercent(8),
  }).correctBalance(
    'e0',
    LocalDate.parse('2026-08-01'),
    reais(10_000),
    'opening',
  );

const apartment = () =>
  Bucket.goal({
    id: 'apartment',
    name: 'Apartment',
    target: { amount: reais(150_000), date: LocalDate.parse('2031-03-31') },
    rule: Allocation.fixed(reais(1_778)),
    priority: 2,
    expectedYield: Percentage.ofPercent(8),
  });

const projecting = (...buckets: Bucket[]) =>
  new ProjectWealth(new InMemoryBucketRepository(buckets));

describe('ProjectWealth horizons', () => {
  it('projects five, ten, twenty and thirty years', async () => {
    const view = await projecting(retirement()).project({
      contributionsCents: { retirement: 100_000 },
    });

    expect(view.horizons.map((h) => h.years)).toEqual([5, 10, 20, 30]);
  });

  it('grows a balance that is only compounding, with no contributions', async () => {
    const view = await projecting(retirement()).project({
      contributionsCents: {},
    });

    // R$ 10.000 at 8 % for five years is a little over R$ 14.800.
    const atFive = view.horizons[0]?.totalCents ?? 0;
    expect(atFive).toBeGreaterThan(1_480_000);
    expect(atFive).toBeLessThan(1_500_000);
  });

  it('grows further the longer the horizon', async () => {
    const view = await projecting(retirement()).project({
      contributionsCents: { retirement: 100_000 },
    });
    const totals = view.horizons.map((h) => h.totalCents);

    expect(totals[1]).toBeGreaterThan(totals[0] ?? 0);
    expect(totals[3]).toBeGreaterThan(totals[2] ?? 0);
  });

  // The composition of future wealth, not just the total.
  it('breaks each horizon down by bucket', async () => {
    const view = await projecting(retirement(), apartment()).project({
      contributionsCents: { retirement: 100_000, apartment: 177_800 },
    });
    const [first] = view.horizons;

    expect(first?.byBucket.map((b) => b.name)).toEqual([
      'Retirement',
      'Apartment',
    ]);
    expect(first?.totalCents).toBe(
      (first?.byBucket ?? []).reduce((sum, b) => sum + b.amountCents, 0),
    );
  });

  it('leaves an archived bucket out entirely', async () => {
    const view = await projecting(retirement().archive()).project({
      contributionsCents: { retirement: 100_000 },
    });

    expect(view.horizons[0]?.byBucket).toEqual([]);
    expect(view.buckets).toEqual([]);
  });

  it('projects nothing when there are no buckets', async () => {
    const view = await projecting().project({ contributionsCents: {} });

    expect(view.horizons.every((h) => h.totalCents === 0)).toBe(true);
  });
});

describe('ProjectWealth per bucket', () => {
  it('says when a goal reaches its target at the current rate', async () => {
    const view = await projecting(apartment()).project({
      contributionsCents: { apartment: 177_800 },
    });
    const [projection] = view.buckets;

    expect(projection?.isGoal).toBe(true);
    expect(projection?.reachesTargetIn).toBeGreaterThan(0);
    expect(projection?.isOnTrack).toBe(true);
  });

  it('reports a goal already met as reached immediately', async () => {
    const met = apartment().correctBalance(
      'e1',
      LocalDate.parse('2026-08-01'),
      reais(200_000),
      'inheritance',
    );

    const view = await projecting(met).project({
      contributionsCents: { apartment: 0 },
    });

    expect(view.buckets[0]?.reachesTargetIn).toBe(0);
  });

  // No contribution and no yield means it never gets there.
  it('reports an unreachable goal and the contribution that would fix it', async () => {
    const stalled = Bucket.goal({
      id: 'stalled',
      name: 'Stalled',
      target: { amount: reais(50_000), date: LocalDate.parse('2030-01-01') },
      rule: Allocation.fixed(Money.zero()),
      priority: 1,
    });

    const view = await projecting(stalled).project({
      contributionsCents: { stalled: 0 },
    });
    const [projection] = view.buckets;

    expect(projection?.isOnTrack).toBe(false);
    expect(projection?.contributionToCatchUpCents).toBeGreaterThan(0);
  });

  // An ongoing bucket has no finish line — only whether the rate is right.
  it('answers an ongoing bucket in five and ten years, with no target', async () => {
    const view = await projecting(retirement()).project({
      contributionsCents: { retirement: 100_000 },
    });
    const [projection] = view.buckets;

    expect(projection?.targetCents).toBeUndefined();
    expect(projection?.isOnTrack).toBeUndefined();
    expect(projection?.inFiveYearsCents).toBeGreaterThan(0);
    expect(projection?.inTenYearsCents).toBeGreaterThan(
      projection?.inFiveYearsCents ?? 0,
    );
  });

  it('carries the yield as the assumption it is', async () => {
    const view = await projecting(retirement()).project({
      contributionsCents: {},
    });

    expect(view.buckets[0]?.expectedYieldPercent).toBe(8);
  });
});

describe('ProjectWealth assumptions can be tested', () => {
  it('moves the projection when the yield is overridden', async () => {
    const base = await projecting(retirement()).project({
      contributionsCents: { retirement: 100_000 },
    });
    const optimistic = await projecting(retirement()).project({
      contributionsCents: { retirement: 100_000 },
      yieldOverrides: { retirement: 12 },
    });

    expect(optimistic.horizons[3]?.totalCents).toBeGreaterThan(
      base.horizons[3]?.totalCents ?? 0,
    );
  });

  it('treats a bucket with no stored yield as not growing on its own', async () => {
    const flat = Bucket.ongoing({
      id: 'cash',
      name: 'Cash',
      rule: Allocation.fixed(reais(100)),
      priority: 1,
    });

    const view = await projecting(flat).project({
      contributionsCents: { cash: 10_000 },
    });

    // Five years of 100 reais a month and nothing else: exactly 6.000 reais.
    expect(view.horizons[0]?.totalCents).toBe(600_000);
  });
});

describe('ProjectWealth retirement', () => {
  // Retirement is measured in monthly income, not in a lump sum.
  it('turns the projected balance into a sustainable monthly income', async () => {
    const view = await projecting(retirement()).project({
      contributionsCents: { retirement: 100_000 },
    });
    const figure = view.retirement;

    expect(figure?.name).toBe('Retirement');
    // 4 % of the pot a year, taken monthly.
    expect(figure?.sustainableMonthlyIncomeCents).toBe(
      Math.round(((figure?.balanceAtHorizonCents ?? 0) * 0.04) / 12),
    );
    expect(figure?.sustainableMonthlyIncomeCents).toBeGreaterThan(0);
  });

  it('reports nothing when there is no retirement bucket', async () => {
    const view = await projecting(apartment()).project({
      contributionsCents: {},
    });

    expect(view.retirement).toBeUndefined();
  });
});
