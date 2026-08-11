import type { AllocationPreviewResponse, BucketResponse } from '@fin/contracts';
import { describe, expect, it } from 'vitest';

import { ManageBuckets } from '../../../application/goals/uc-6-manage-buckets.js';
import {
  InMemoryBucketRepository,
  InMemoryCycleRepository,
  InMemorySettingsRepository,
} from '../../../application/testing/fakes.js';
import {
  CycleRef,
  PaydayAnchor,
  ShiftPolicy,
} from '../../../domain/budgeting/cycle-ref.js';
import { Cycle } from '../../../domain/budgeting/cycle.js';
import {
  EntryKind,
  LedgerEntry,
} from '../../../domain/budgeting/ledger-entry.js';
import { Allocation, Bucket } from '../../../domain/goals/bucket.js';
import { noHolidays } from '../../../domain/ports/holiday-calendar.js';
import { LocalDate } from '../../../domain/shared/local-date.js';
import { Money } from '../../../domain/shared/money.js';
import { Percentage } from '../../../domain/shared/percentage.js';
import { buildTestServer } from '../testing/test-server.js';

const anchor = PaydayAnchor.of(5, ShiftPolicy.Preceding);
const august = CycleRef.forMonth('2026-08', anchor, noHolidays);

const reserve = () =>
  Bucket.goal({
    id: 'reserve',
    name: 'Reserve',
    target: {
      amount: Money.fromCents(6_000_000),
      date: LocalDate.parse('2027-12-31'),
    },
    rule: Allocation.percentOfExpectedSurplus(Percentage.ofPercent(20)),
    priority: 1,
  });

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
        planned: Money.fromCents(1_000_000),
      }),
    ],
  });

const serverWith = (options: { buckets?: Bucket[]; cycles?: Cycle[] } = {}) => {
  let next = 0;

  return buildTestServer({
    manageBuckets: new ManageBuckets(
      new InMemoryBucketRepository(options.buckets ?? []),
      new InMemoryCycleRepository(options.cycles ?? []),
      new InMemorySettingsRepository(anchor),
      noHolidays,
      () => `id-${String(++next)}`,
    ),
  });
};

describe('POST /buckets', () => {
  it('creates a goal with its target', async () => {
    const response = await serverWith().inject({
      method: 'POST',
      url: '/buckets',
      payload: {
        name: 'Apartment',
        mode: 'GOAL',
        target: 15_000_000,
        targetDate: '2031-03-31',
        rule: { kind: 'PERCENT', percent: 20 },
        priority: 1,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json<BucketResponse>().target).toBe(15_000_000);
  });

  it('creates an ongoing bucket with no target', async () => {
    const response = await serverWith().inject({
      method: 'POST',
      url: '/buckets',
      payload: {
        name: 'Investments',
        mode: 'ONGOING',
        rule: { kind: 'FIXED', amount: 100_000 },
        priority: 2,
      },
    });
    const bucket = response.json<BucketResponse>();

    expect(bucket.target).toBeNull();
    expect(bucket.percentComplete).toBeNull();
  });

  it('answers 400 to a goal with no target', async () => {
    const response = await serverWith().inject({
      method: 'POST',
      url: '/buckets',
      payload: {
        name: 'Apartment',
        mode: 'GOAL',
        rule: { kind: 'PERCENT', percent: 20 },
        priority: 1,
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it.each([
    ['a missing body', {}],
    ['an unknown rule', { name: 'X', rule: { kind: 'MAGIC' }, priority: 1 }],
  ])('answers 400 to %s', async (_name, payload) => {
    const response = await serverWith().inject({
      method: 'POST',
      url: '/buckets',
      payload,
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('GET /buckets', () => {
  it('lists them with balance and progress', async () => {
    const response = await serverWith({ buckets: [reserve()] }).inject({
      method: 'GET',
      url: '/buckets',
    });
    const [bucket] = response.json<BucketResponse[]>();

    expect(bucket?.name).toBe('Reserve');
    expect(bucket?.balance).toBe(0);
    expect(bucket?.percentComplete).toBe(0);
  });
});

describe('POST /buckets/:id/events', () => {
  it('records a yield', async () => {
    const response = await serverWith({ buckets: [reserve()] }).inject({
      method: 'POST',
      url: '/buckets/reserve/events',
      payload: { kind: 'YIELD', amount: 1_350, date: '2026-08-31' },
    });
    const bucket = response.json<BucketResponse>();

    expect(bucket.yielded).toBe(1_350);
    expect(bucket.contributed).toBe(0);
  });

  it('records a correction with its reason', async () => {
    const response = await serverWith({ buckets: [reserve()] }).inject({
      method: 'POST',
      url: '/buckets/reserve/events',
      payload: {
        kind: 'CORRECTION',
        amount: 845_020,
        date: '2026-09-01',
        reason: 'statement differed',
      },
    });

    expect(response.json<BucketResponse>().balance).toBe(845_020);
  });

  // An unexplained balance is exactly what the log exists to prevent.
  it('answers 400 to a correction with no reason', async () => {
    const response = await serverWith({ buckets: [reserve()] }).inject({
      method: 'POST',
      url: '/buckets/reserve/events',
      payload: { kind: 'CORRECTION', amount: 1, date: '2026-09-01' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('answers 409 to a withdrawal larger than the balance', async () => {
    const response = await serverWith({ buckets: [reserve()] }).inject({
      method: 'POST',
      url: '/buckets/reserve/events',
      payload: {
        kind: 'WITHDRAWAL',
        amount: 100,
        date: '2026-09-01',
        reason: 'too much',
      },
    });

    expect(response.statusCode).toBe(409);
  });

  it('records an override for one cycle', async () => {
    const response = await serverWith({
      buckets: [reserve()],
      cycles: [cycleWithSurplus()],
    }).inject({
      method: 'POST',
      url: '/buckets/reserve/events',
      payload: { kind: 'OVERRIDE', amount: 700_000, month: '2026-08' },
    });
    const bucket = response.json<BucketResponse>();

    expect(bucket.balance).toBe(700_000);
    expect(bucket.events[0]?.ruleWouldHaveBeen).toBe(200_000);
  });

  it('answers 400 to an unknown event kind', async () => {
    const response = await serverWith({ buckets: [reserve()] }).inject({
      method: 'POST',
      url: '/buckets/reserve/events',
      payload: { kind: 'MAGIC' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('answers 404 for a bucket that is not there', async () => {
    const response = await serverWith().inject({
      method: 'POST',
      url: '/buckets/missing/events',
      payload: { kind: 'YIELD', amount: 1, date: '2026-08-31' },
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('PATCH /buckets/:id', () => {
  it.each([
    ['the rule', { rule: { kind: 'FIXED', amount: 177_800 } }],
    ['the priority', { priority: 4 }],
    ['the expected yield', { expectedYieldPercent: 10 }],
    ['the status', { status: 'ARCHIVED' }],
  ])('changes %s', async (_name, payload) => {
    const response = await serverWith({ buckets: [reserve()] }).inject({
      method: 'PATCH',
      url: '/buckets/reserve',
      payload,
    });

    expect(response.statusCode).toBe(200);
  });

  it('answers 400 when the body changes nothing', async () => {
    const response = await serverWith({ buckets: [reserve()] }).inject({
      method: 'PATCH',
      url: '/buckets/reserve',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('allocating a cycle over the API', () => {
  it('previews what the rules would take, without taking it', async () => {
    const app = serverWith({
      buckets: [reserve()],
      cycles: [cycleWithSurplus()],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/cycles/2026-08/allocation-preview',
    });
    const preview = response.json<AllocationPreviewResponse>();

    expect(preview.expectedSurplus).toBe(1_000_000);
    expect(preview.fundings[0]?.funded).toBe(200_000);
    expect(preview.isOvercommitted).toBe(false);
  });

  it('allocates, and says so', async () => {
    const app = serverWith({
      buckets: [reserve()],
      cycles: [cycleWithSurplus()],
    });

    const response = await app.inject({
      method: 'POST',
      url: '/cycles/2026-08/allocate',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<AllocationPreviewResponse>().fundings[0]?.funded).toBe(
      200_000,
    );
  });

  it('deletes a bucket', async () => {
    const response = await serverWith({ buckets: [reserve()] }).inject({
      method: 'DELETE',
      url: '/buckets/reserve',
    });

    expect(response.statusCode).toBe(204);
  });
});
