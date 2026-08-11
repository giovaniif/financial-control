import type {
  Bucket as BucketRow,
  BucketEvent as EventRow,
} from '@prisma/client';

import type { BucketEvent } from '../../../domain/goals/bucket-event.js';
import type { AllocationRule } from '../../../domain/goals/bucket.js';
import { Allocation, Bucket } from '../../../domain/goals/bucket.js';
import { LocalDate } from '../../../domain/shared/local-date.js';
import { Money } from '../../../domain/shared/money.js';
import { Percentage } from '../../../domain/shared/percentage.js';

type Row = BucketRow & { events: EventRow[] };

const toDb = (date: LocalDate) => new Date(`${date.toISO()}T00:00:00.000Z`);
const cents = (value: bigint | null) => Money.fromCents(Number(value ?? 0n));

function toRule(row: BucketRow): AllocationRule {
  return row.ruleKind === 'PERCENT'
    ? Allocation.percentOfExpectedSurplus(
        Percentage.ofBasisPoints(row.ruleBasisPoints ?? 0),
      )
    : Allocation.fixed(cents(row.ruleFixedCents));
}

function toEvent(row: EventRow): BucketEvent {
  switch (row.kind) {
    case 'CONTRIBUTION':
      return {
        kind: 'CONTRIBUTION',
        id: row.id,
        cycleMonth: row.cycleMonth ?? '',
        amount: cents(row.amountCents),
      };
    case 'OVERRIDE':
      return {
        kind: 'OVERRIDE',
        id: row.id,
        cycleMonth: row.cycleMonth ?? '',
        amount: cents(row.amountCents),
        ruleWouldHaveBeen: cents(row.ruleWouldHaveBeenCents),
      };
    case 'YIELD':
      return {
        kind: 'YIELD',
        id: row.id,
        date: LocalDate.fromInstant(row.occurredOn ?? new Date(0)),
        amount: cents(row.amountCents),
      };
    case 'CORRECTION':
      return {
        kind: 'CORRECTION',
        id: row.id,
        date: LocalDate.fromInstant(row.occurredOn ?? new Date(0)),
        newBalance: cents(row.newBalanceCents),
        reason: row.reason ?? '',
      };
    default:
      return {
        kind: 'WITHDRAWAL',
        id: row.id,
        date: LocalDate.fromInstant(row.occurredOn ?? new Date(0)),
        amount: cents(row.amountCents),
        reason: row.reason ?? '',
      };
  }
}

export function toBucket(row: Row): Bucket {
  const shared = {
    id: row.id,
    name: row.name,
    purpose: row.purpose,
    rule: toRule(row),
    priority: row.priority,
    status: row.status,
    events: row.events.map(toEvent),
    ...(row.expectedYieldBasisPoints === null
      ? {}
      : {
          expectedYield: Percentage.ofBasisPoints(row.expectedYieldBasisPoints),
        }),
  };

  return row.mode === 'GOAL'
    ? Bucket.goal({
        ...shared,
        target: {
          amount: cents(row.targetCents),
          date: LocalDate.fromInstant(row.targetDate ?? new Date(0)),
        },
      })
    : Bucket.ongoing(shared);
}

export function fromBucket(bucket: Bucket): {
  header: Omit<BucketRow, 'createdAt' | 'updatedAt'>;
  events: Omit<EventRow, 'bucketId'>[];
} {
  const rule = bucket.rule;

  return {
    header: {
      id: bucket.id,
      name: bucket.name,
      purpose: bucket.purpose,
      mode: bucket.mode,
      targetCents:
        bucket.target === undefined ? null : BigInt(bucket.target.amount.cents),
      targetDate: bucket.target === undefined ? null : toDb(bucket.target.date),
      ruleKind: rule.kind,
      ruleBasisPoints:
        rule.kind === 'PERCENT' ? rule.percentage.basisPoints : null,
      ruleFixedCents: rule.kind === 'FIXED' ? BigInt(rule.amount.cents) : null,
      priority: bucket.priority,
      expectedYieldBasisPoints: bucket.expectedYield?.basisPoints ?? null,
      status: bucket.status,
    },
    events: bucket.events.map((event, index) => ({
      id: event.id,
      kind: event.kind,
      sequence: index,
      cycleMonth:
        event.kind === 'CONTRIBUTION' || event.kind === 'OVERRIDE'
          ? event.cycleMonth
          : null,
      occurredOn:
        event.kind === 'YIELD' ||
        event.kind === 'CORRECTION' ||
        event.kind === 'WITHDRAWAL'
          ? toDb(event.date)
          : null,
      amountCents:
        event.kind === 'CORRECTION' ? null : BigInt(event.amount.cents),
      newBalanceCents:
        event.kind === 'CORRECTION' ? BigInt(event.newBalance.cents) : null,
      ruleWouldHaveBeenCents:
        event.kind === 'OVERRIDE'
          ? BigInt(event.ruleWouldHaveBeen.cents)
          : null,
      reason:
        event.kind === 'CORRECTION' || event.kind === 'WITHDRAWAL'
          ? event.reason
          : null,
    })),
  };
}
