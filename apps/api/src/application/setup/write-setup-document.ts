import { Account } from '../../domain/budgeting/account.js';
import { CycleRef, PaydayAnchor } from '../../domain/budgeting/cycle-ref.js';
import { Cycle } from '../../domain/budgeting/cycle.js';
import type { EntryOrigin } from '../../domain/budgeting/ledger-entry.js';
import { LedgerEntry } from '../../domain/budgeting/ledger-entry.js';
import { RecurringTemplate } from '../../domain/budgeting/recurring-template.js';
import type { BucketEvent } from '../../domain/goals/bucket-event.js';
import { Allocation, Bucket } from '../../domain/goals/bucket.js';
import type { HolidayCalendar } from '../../domain/ports/holiday-calendar.js';
import type {
  AccountRepository,
  BucketRepository,
  CycleRepository,
  RecurringTemplateRepository,
  SettingsRepository,
} from '../../domain/ports/repositories.js';
import { LocalDate } from '../../domain/shared/local-date.js';
import { Money } from '../../domain/shared/money.js';
import { Percentage } from '../../domain/shared/percentage.js';
import type {
  SetupBucket,
  SetupBucketEvent,
  SetupDocument,
  SetupEntry,
  SetupEntryOrigin,
  SetupTemplate,
} from './setup-document.js';

/**
 * Writes a composed {@link SetupDocument} into the repositories, replacing
 * whatever is there — the one path by which a finished setup conversation
 * becomes data (UC-1.5).
 *
 * It maps document to domain rather than calling the interactors, because a
 * document describes **state** and the interactors describe changes: there is
 * no sequence of "add a bill" calls that reproduces a cycle that was already
 * closed.
 */
export class WriteSetupDocument {
  constructor(
    private readonly cycles: CycleRepository,
    private readonly accounts: AccountRepository,
    private readonly templates: RecurringTemplateRepository,
    private readonly buckets: BucketRepository,
    private readonly settings: SettingsRepository,
    private readonly holidays: HolidayCalendar,
  ) {}

  async write(document: SetupDocument): Promise<void> {
    // The anchor first: every cycle is sliced by it, so restoring entries
    // against the old one would put them in the wrong months.
    const anchor = PaydayAnchor.of(
      document.anchor.anchorDay,
      document.anchor.shiftPolicy,
    );
    await this.settings.save(anchor);

    await this.clear();

    for (const account of document.accounts) {
      await this.accounts.save(
        Account.open({
          id: account.id,
          name: account.name,
          type: account.type,
          balance: Money.fromCents(account.balance),
        }),
      );
    }

    for (const cycle of document.cycles) {
      await this.cycles.save(
        Cycle.rehydrate({
          id: cycle.month,
          ref: CycleRef.forMonth(cycle.month, anchor, this.holidays),
          status: cycle.status,
          openingBalance: Money.fromCents(cycle.openingBalance),
          entries: cycle.entries.map(toLedgerEntry),
        }),
      );
    }

    for (const template of document.templates) {
      await this.templates.save(toTemplate(template));
    }
    for (const bucket of document.buckets) {
      await this.buckets.save(toBucket(bucket));
    }
  }

  /** A document is the whole state, so it replaces rather than merges. */
  private async clear(): Promise<void> {
    await this.cycles.deleteAll();
    await this.accounts.deleteAll();
    await this.templates.deleteAll();
    await this.buckets.deleteAll();
  }
}

function toOrigin(origin: SetupEntryOrigin): EntryOrigin {
  switch (origin.kind) {
    case 'FROM_TEMPLATE':
      return { kind: 'FROM_TEMPLATE', templateId: origin.ref };
    case 'FROM_ALLOCATION':
      return { kind: 'FROM_ALLOCATION', bucketId: origin.ref };
    case 'OVERRIDE':
      return {
        kind: 'OVERRIDE',
        original: toOrigin(origin.original),
        projected: Money.fromCents(origin.projected),
      };
    default:
      return { kind: 'MANUAL' };
  }
}

/**
 * `create` always produces a pending entry, so a settled one is settled again
 * on the way back in — the same replay the Prisma mapper performs.
 */
function toLedgerEntry(entry: SetupEntry): LedgerEntry {
  const created = LedgerEntry.create({
    id: entry.id,
    description: entry.description,
    kind: entry.kind,
    dueDate: LocalDate.parse(entry.dueDate),
    planned: Money.fromCents(entry.planned),
    isEstimate: entry.isEstimate,
    origin: toOrigin(entry.origin),
  });

  switch (entry.status) {
    case 'PAID':
    case 'RECEIVED':
      return created.settle(
        Money.fromCents(entry.actual ?? entry.planned),
        entry.status,
      );
    case 'SKIPPED':
      return created.skip();
    case 'OVERDUE':
      return created.markOverdue();
    default:
      return created;
  }
}

function toTemplate(template: SetupTemplate): RecurringTemplate {
  return RecurringTemplate.create({
    id: template.id,
    name: template.name,
    direction: template.direction,
    dueDayOfMonth: template.dueDayOfMonth,
    amount: Money.fromCents(template.amount),
    startMonth: template.startMonth,
    ...(template.endMonth === null ? {} : { endMonth: template.endMonth }),
    isEstimate: template.isEstimate,
    status: template.status,
    valueSchedule: template.valueSchedule.map((step) => ({
      fromMonth: step.fromMonth,
      amount: Money.fromCents(step.amount),
    })),
  });
}

function toEvent(event: SetupBucketEvent): BucketEvent {
  switch (event.kind) {
    case 'CONTRIBUTION':
      return {
        kind: 'CONTRIBUTION',
        id: event.id,
        cycleMonth: event.cycleMonth,
        amount: Money.fromCents(event.amount),
      };
    case 'OVERRIDE':
      return {
        kind: 'OVERRIDE',
        id: event.id,
        cycleMonth: event.cycleMonth,
        amount: Money.fromCents(event.amount),
        ruleWouldHaveBeen: Money.fromCents(event.ruleWouldHaveBeen),
      };
    case 'YIELD':
      return {
        kind: 'YIELD',
        id: event.id,
        date: LocalDate.parse(event.date),
        amount: Money.fromCents(event.amount),
      };
    case 'CORRECTION':
      return {
        kind: 'CORRECTION',
        id: event.id,
        date: LocalDate.parse(event.date),
        newBalance: Money.fromCents(event.newBalance),
        reason: event.reason,
      };
    default:
      return {
        kind: 'WITHDRAWAL',
        id: event.id,
        date: LocalDate.parse(event.date),
        amount: Money.fromCents(event.amount),
        reason: event.reason,
      };
  }
}

function toBucket(bucket: SetupBucket): Bucket {
  const shared = {
    id: bucket.id,
    name: bucket.name,
    purpose: bucket.purpose,
    rule:
      bucket.rule.kind === 'PERCENT'
        ? Allocation.percentOfExpectedSurplus(
            Percentage.ofBasisPoints(bucket.rule.basisPoints),
          )
        : Allocation.fixed(Money.fromCents(bucket.rule.amount)),
    priority: bucket.priority,
    status: bucket.status,
    events: bucket.events.map(toEvent),
    ...(bucket.expectedYieldBasisPoints === null
      ? {}
      : {
          expectedYield: Percentage.ofBasisPoints(
            bucket.expectedYieldBasisPoints,
          ),
        }),
  };

  // GOAL and ONGOING are a real invariant: a goal must have both a target and
  // a date, and an ongoing bucket must have neither.
  return bucket.target === null
    ? Bucket.ongoing(shared)
    : Bucket.goal({
        ...shared,
        target: {
          amount: Money.fromCents(bucket.target.amount),
          date: LocalDate.parse(bucket.target.date),
        },
      });
}
