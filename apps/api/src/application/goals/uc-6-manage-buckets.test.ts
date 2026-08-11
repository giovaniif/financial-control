import { describe, expect, it } from 'vitest';

import {
  CycleRef,
  PaydayAnchor,
  ShiftPolicy,
} from '../../domain/budgeting/cycle-ref.js';
import { Cycle } from '../../domain/budgeting/cycle.js';
import { EntryKind, LedgerEntry } from '../../domain/budgeting/ledger-entry.js';
import { Allocation, Bucket, BucketStatus } from '../../domain/goals/bucket.js';
import { noHolidays } from '../../domain/ports/holiday-calendar.js';
import { LocalDate } from '../../domain/shared/local-date.js';
import { Money } from '../../domain/shared/money.js';
import { Percentage } from '../../domain/shared/percentage.js';
import {
  InMemoryBucketRepository,
  InMemoryCycleRepository,
  InMemorySettingsRepository,
} from '../testing/fakes.js';
import { BucketNotFound, ManageBuckets } from './uc-6-manage-buckets.js';

const anchor = PaydayAnchor.of(5, ShiftPolicy.Preceding);
const august = CycleRef.forMonth('2026-08', anchor, noHolidays);
const reais = (amount: number) => Money.fromCents(Math.round(amount * 100));

const reserve = () =>
  Bucket.goal({
    id: 'reserve',
    name: 'Reserve',
    target: { amount: reais(60_000), date: LocalDate.parse('2027-12-31') },
    rule: Allocation.percentOfExpectedSurplus(Percentage.ofPercent(20)),
    priority: 1,
  });

const investments = () =>
  Bucket.ongoing({
    id: 'investments',
    name: 'Investments',
    rule: Allocation.percentOfExpectedSurplus(Percentage.ofPercent(10)),
    priority: 2,
  });

/** A cycle with R$ 10.000 of Expected Surplus and nothing allocated yet. */
const cycleWithSurplus = () =>
  Cycle.open({
    id: 'cycle-aug',
    ref: august,
    openingBalance: Money.zero(),
    entries: [
      LedgerEntry.create({
        id: 'salary',
        description: 'Salary',
        kind: EntryKind.Income,
        dueDate: august.start,
        planned: reais(10_000),
      }),
    ],
  });

const managing = (options: { buckets?: Bucket[]; cycles?: Cycle[] } = {}) => {
  const bucketRepo = new InMemoryBucketRepository(options.buckets ?? []);
  const cycleRepo = new InMemoryCycleRepository(options.cycles ?? []);
  let next = 0;

  return {
    bucketRepo,
    cycleRepo,
    useCase: new ManageBuckets(
      bucketRepo,
      cycleRepo,
      new InMemorySettingsRepository(anchor),
      noHolidays,
      () => `id-${String(++next)}`,
    ),
  };
};

describe('ManageBuckets.createGoal and createOngoing', () => {
  it('creates a goal with its target', async () => {
    const { useCase } = managing();

    const bucket = await useCase.createGoal({
      name: 'Apartment',
      targetCents: 15_000_000,
      targetDate: '2031-03-31',
      rule: { kind: 'PERCENT', percent: 20 },
      priority: 1,
    });

    expect(bucket.mode).toBe('GOAL');
    expect(bucket.targetCents).toBe(15_000_000);
    expect(bucket.percentComplete).toBe(0);
  });

  it('creates an ongoing bucket with no target at all', async () => {
    const { useCase } = managing();

    const bucket = await useCase.createOngoing({
      name: 'Investments',
      rule: { kind: 'FIXED', amountCents: 100_000 },
      priority: 2,
    });

    expect(bucket.mode).toBe('ONGOING');
    expect(bucket.targetCents).toBeUndefined();
    expect(bucket.percentComplete).toBeUndefined();
  });

  it('carries a purpose when one is given', async () => {
    const { useCase } = managing();

    const goal = await useCase.createGoal({
      name: 'Reserve',
      purpose: 'Six months of fixed costs, untouched.',
      targetCents: 6_000_000,
      targetDate: '2027-12-31',
      rule: { kind: 'PERCENT', percent: 20 },
      priority: 1,
    });
    const ongoing = await useCase.createOngoing({
      name: 'Investments',
      purpose: 'Brokerage. No end date.',
      rule: { kind: 'FIXED', amountCents: 100_000 },
      priority: 2,
    });

    expect(goal.purpose).toBe('Six months of fixed costs, untouched.');
    expect(ongoing.purpose).toBe('Brokerage. No end date.');
  });

  // Production supplies no id generator; the default has to produce one.
  it('generates an id when none is supplied', async () => {
    const useCase = new ManageBuckets(
      new InMemoryBucketRepository(),
      new InMemoryCycleRepository(),
      new InMemorySettingsRepository(anchor),
      noHolidays,
    );

    const bucket = await useCase.createOngoing({
      name: 'Investments',
      rule: { kind: 'FIXED', amountCents: 1 },
      priority: 1,
    });

    expect(bucket.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('refuses a goal with a target of nothing', async () => {
    const { useCase } = managing();

    await expect(
      useCase.createGoal({
        name: 'Nothing',
        targetCents: 0,
        targetDate: '2031-03-31',
        rule: { kind: 'PERCENT', percent: 20 },
        priority: 1,
      }),
    ).rejects.toThrow();
  });
});

describe('ManageBuckets event log', () => {
  it('records a yield apart from contributions', async () => {
    const { useCase } = managing({ buckets: [reserve()] });

    const bucket = await useCase.recordYield('reserve', '2026-08-31', 1_350);

    expect(bucket.balanceCents).toBe(1_350);
    expect(bucket.yieldedCents).toBe(1_350);
    expect(bucket.contributedCents).toBe(0);
  });

  it('corrects a balance, with the reason kept on the event', async () => {
    const { useCase } = managing({ buckets: [reserve()] });

    const bucket = await useCase.correctBalance(
      'reserve',
      '2026-09-01',
      845_020,
      'statement differed after fees',
    );

    expect(bucket.balanceCents).toBe(845_020);
    expect(bucket.events[0]?.reason).toBe('statement differed after fees');
  });

  it('refuses a correction with no reason', async () => {
    const { useCase } = managing({ buckets: [reserve()] });

    await expect(
      useCase.correctBalance('reserve', '2026-09-01', 1, '  '),
    ).rejects.toThrow();
  });

  it('withdraws with a reason', async () => {
    const { useCase } = managing({ buckets: [reserve()] });

    await useCase.correctBalance('reserve', '2026-08-01', 100_000, 'opening');
    const bucket = await useCase.withdraw(
      'reserve',
      '2026-09-01',
      40_000,
      'emergency',
    );

    expect(bucket.balanceCents).toBe(60_000);
  });

  it('refuses a withdrawal larger than the balance', async () => {
    const { useCase } = managing({ buckets: [reserve()] });

    await expect(
      useCase.withdraw('reserve', '2026-09-01', 1, 'nothing there'),
    ).rejects.toThrow();
  });

  it('records an override alongside what the rule would have said', async () => {
    const { useCase } = managing({
      buckets: [reserve()],
      cycles: [cycleWithSurplus()],
    });

    const bucket = await useCase.overrideContribution(
      'reserve',
      '2026-08',
      700_000,
    );

    expect(bucket.balanceCents).toBe(700_000);
    // 20 % of R$ 10.000 would have been R$ 2.000.
    expect(bucket.events[0]?.ruleWouldHaveBeenCents).toBe(200_000);
  });
});

describe('ManageBuckets.previewAllocation', () => {
  it('reports what each bucket would take from the surplus', async () => {
    const { useCase } = managing({
      buckets: [reserve(), investments()],
      cycles: [cycleWithSurplus()],
    });

    const preview = await useCase.previewAllocation('2026-08');

    expect(preview.expectedSurplusCents).toBe(1_000_000);
    expect(preview.fundings.map((f) => f.fundedCents)).toEqual([
      200_000, 100_000,
    ]);
    expect(preview.isOvercommitted).toBe(false);
  });

  it('reports the shortfall when the rules ask for too much', async () => {
    const greedy = Bucket.ongoing({
      id: 'greedy',
      name: 'Greedy',
      rule: Allocation.fixed(reais(20_000)),
      priority: 3,
    });
    const { useCase } = managing({
      buckets: [reserve(), greedy],
      cycles: [cycleWithSurplus()],
    });

    const preview = await useCase.previewAllocation('2026-08');

    expect(preview.isOvercommitted).toBe(true);
    expect(preview.shortfallCents).toBeGreaterThan(0);
  });

  it('persists nothing', async () => {
    const { useCase, bucketRepo } = managing({
      buckets: [reserve()],
      cycles: [cycleWithSurplus()],
    });

    await useCase.previewAllocation('2026-08');

    expect((await bucketRepo.findById('reserve'))?.events).toHaveLength(0);
  });
});

describe('ManageBuckets.allocate', () => {
  it('records a contribution on each funded bucket', async () => {
    const { useCase, bucketRepo } = managing({
      buckets: [reserve(), investments()],
      cycles: [cycleWithSurplus()],
    });

    await useCase.allocate('2026-08');

    expect((await bucketRepo.findById('reserve'))?.balance.cents).toBe(200_000);
    expect((await bucketRepo.findById('investments'))?.balance.cents).toBe(
      100_000,
    );
  });

  it('writes the allocations into the ledger as outgoing entries', async () => {
    const { useCase, cycleRepo } = managing({
      buckets: [reserve()],
      cycles: [cycleWithSurplus()],
    });

    await useCase.allocate('2026-08');

    const cycle = await cycleRepo.findByMonth(august);
    const allocation = cycle?.entries.find(
      (entry) => entry.kind === EntryKind.Allocation,
    );

    expect(allocation?.description).toBe('→ Reserve');
    expect(allocation?.amount.planned.cents).toBe(-200_000);
  });

  it('leaves Net Surplus as what is left after the allocations', async () => {
    const { useCase, cycleRepo } = managing({
      buckets: [reserve(), investments()],
      cycles: [cycleWithSurplus()],
    });

    await useCase.allocate('2026-08');

    const chain = (await cycleRepo.findByMonth(august))?.chain();
    expect(chain?.expectedSurplus.cents).toBe(1_000_000);
    expect(chain?.allocations.cents).toBe(300_000);
    expect(chain?.netSurplus.cents).toBe(700_000);
  });

  it('does not contribute twice when run again', async () => {
    const { useCase, bucketRepo } = managing({
      buckets: [reserve()],
      cycles: [cycleWithSurplus()],
    });

    await useCase.allocate('2026-08');
    await useCase.allocate('2026-08');

    expect((await bucketRepo.findById('reserve'))?.events).toHaveLength(1);
  });

  it('leaves a closed cycle alone', async () => {
    const closed = cycleWithSurplus().skipEntry('salary').close();
    const { useCase, bucketRepo } = managing({
      buckets: [reserve()],
      cycles: [closed],
    });

    await useCase.allocate('2026-08');

    expect((await bucketRepo.findById('reserve'))?.events).toHaveLength(0);
  });

  it('allocates nothing from a cycle that was never materialised', async () => {
    const { useCase, bucketRepo } = managing({ buckets: [reserve()] });

    await useCase.allocate('2026-08');

    expect((await bucketRepo.findById('reserve'))?.events).toHaveLength(0);
  });

  it('skips a bucket the user already overrode for that cycle', async () => {
    const { useCase, bucketRepo } = managing({
      buckets: [reserve()],
      cycles: [cycleWithSurplus()],
    });

    await useCase.overrideContribution('reserve', '2026-08', 700_000);
    await useCase.allocate('2026-08');

    const bucket = await bucketRepo.findById('reserve');
    expect(bucket?.events).toHaveLength(1);
    expect(bucket?.balance.cents).toBe(700_000);
  });
});

describe('ManageBuckets configuration', () => {
  it('changes the rule going forward', async () => {
    const { useCase } = managing({ buckets: [reserve()] });

    const bucket = await useCase.changeRule('reserve', {
      kind: 'FIXED',
      amountCents: 177_800,
    });

    expect(bucket.rule).toEqual({ kind: 'FIXED', amountCents: 177_800 });
  });

  it('changes the priority', async () => {
    const { useCase } = managing({ buckets: [reserve()] });

    expect((await useCase.changePriority('reserve', 4)).priority).toBe(4);
  });

  it('carries an expected yield as an assumption', async () => {
    const { useCase } = managing({ buckets: [reserve()] });

    expect(
      (await useCase.setExpectedYield('reserve', 10)).expectedYieldPercent,
    ).toBe(10);
  });

  it('archives while keeping the history', async () => {
    const { useCase } = managing({ buckets: [reserve()] });

    await useCase.recordYield('reserve', '2026-08-31', 100);
    const bucket = await useCase.archive('reserve');

    expect(bucket.status).toBe(BucketStatus.Archived);
    expect(bucket.events).toHaveLength(1);
  });

  it('leaves an archived bucket out of allocation', async () => {
    const { useCase, bucketRepo } = managing({
      buckets: [reserve()],
      cycles: [cycleWithSurplus()],
    });

    await useCase.archive('reserve');
    await useCase.allocate('2026-08');

    expect((await bucketRepo.findById('reserve'))?.events).toHaveLength(0);
  });

  it('lists what is stored', async () => {
    const { useCase } = managing({ buckets: [reserve(), investments()] });

    expect((await useCase.list()).map((b) => b.name)).toEqual([
      'Reserve',
      'Investments',
    ]);
  });

  it('deletes', async () => {
    const { useCase, bucketRepo } = managing({ buckets: [reserve()] });

    await useCase.delete('reserve');

    expect(await bucketRepo.findAll()).toHaveLength(0);
  });

  it.each([
    ['archiving', (u: ManageBuckets) => u.archive('missing')],
    ['deleting', (u: ManageBuckets) => u.delete('missing')],
    [
      'yielding',
      (u: ManageBuckets) => u.recordYield('missing', '2026-08-31', 1),
    ],
  ])('refuses %s a bucket that is not there', async (_name, act) => {
    await expect(act(managing().useCase)).rejects.toThrow(BucketNotFound);
  });
});
