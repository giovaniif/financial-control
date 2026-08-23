import type {
  BackupBucket,
  BackupBucketEvent,
  BackupCycle,
  BackupDocument,
  BackupEntry,
  BackupEntryOrigin,
  BackupTemplate,
} from '@fin/contracts';
import { BACKUP_VERSION } from '@fin/contracts';

import { Account } from '../../domain/budgeting/account.js';
import { CycleRef, PaydayAnchor } from '../../domain/budgeting/cycle-ref.js';
import { Cycle } from '../../domain/budgeting/cycle.js';
import type { EntryOrigin } from '../../domain/budgeting/ledger-entry.js';
import { LedgerEntry } from '../../domain/budgeting/ledger-entry.js';
import { RecurringTemplate } from '../../domain/budgeting/recurring-template.js';
import type { BucketEvent } from '../../domain/goals/bucket-event.js';
import { Allocation, Bucket } from '../../domain/goals/bucket.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import type { Clock } from '../../domain/ports/clock.js';
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

export class BackupVersionNotSupported extends DomainError {}

/**
 * UC-1.6 — the export and the import, and nothing else.
 *
 * The document is deliberately **state**, not the views the read endpoints
 * return: a backup has to reproduce what was stored, and a derived figure
 * cannot be put back. The mapping lives here rather than in infrastructure
 * because the format is a contract with the user's own file — it must not
 * move when the database schema does.
 *
 * This is the only recovery mechanism the app has: there is no import from a
 * bank or a spreadsheet, and no managed database taking snapshots.
 */
export class BackupRestore {
  constructor(
    private readonly cycles: CycleRepository,
    private readonly accounts: AccountRepository,
    private readonly templates: RecurringTemplateRepository,
    private readonly buckets: BucketRepository,
    private readonly settings: SettingsRepository,
    private readonly holidays: HolidayCalendar,
    private readonly clock: Clock,
  ) {}

  async export(): Promise<BackupDocument> {
    const anchor = await this.settings.load();
    const months = await this.cycles.allMonths();
    const stored = await Promise.all(
      months.map((month) =>
        this.cycles.findByMonth(
          CycleRef.forMonth(month, anchor, this.holidays),
        ),
      ),
    );

    return {
      version: BACKUP_VERSION,
      exportedAt: this.clock.now().toISOString(),
      anchor: {
        anchorDay: anchor.dayOfMonth,
        shiftPolicy: anchor.shiftPolicy,
      },
      accounts: (await this.accounts.findAll()).map((account) => ({
        id: account.id,
        name: account.name,
        type: account.type,
        balance: account.balance.cents,
      })),
      cycles: stored.filter(isPresent).map(toBackupCycle),
      templates: (await this.templates.findAll()).map(toBackupTemplate),
      buckets: (await this.buckets.findAll()).map(toBackupBucket),
    };
  }

  async restore(document: BackupDocument): Promise<void> {
    if (document.version !== BACKUP_VERSION) {
      throw new BackupVersionNotSupported(
        `Este backup diz ser da versão ${String(document.version)}; o app lê a versão ${String(BACKUP_VERSION)}.`,
      );
    }

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

  /** A restore replaces; anything left behind would be a silent merge. */
  private async clear(): Promise<void> {
    await this.cycles.deleteAll();
    await this.accounts.deleteAll();
    await this.templates.deleteAll();
    await this.buckets.deleteAll();
  }
}

function isPresent<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function toBackupCycle(cycle: Cycle): BackupCycle {
  return {
    month: cycle.ref.month,
    status: cycle.status,
    openingBalance: cycle.openingBalance.cents,
    entries: cycle.entries.map(toBackupEntry),
  };
}

function toBackupEntry(entry: LedgerEntry): BackupEntry {
  return {
    id: entry.id,
    description: entry.description,
    kind: entry.kind,
    dueDate: entry.dueDate.toISO(),
    planned: entry.amount.planned.cents,
    actual: entry.amount.actual?.cents ?? null,
    status: entry.status,
    isEstimate: entry.isEstimate,
    origin: toBackupOrigin(entry.origin),
  };
}

function toBackupOrigin(origin: EntryOrigin): BackupEntryOrigin {
  switch (origin.kind) {
    case 'FROM_TEMPLATE':
      return { kind: 'FROM_TEMPLATE', ref: origin.templateId };
    case 'FROM_ALLOCATION':
      return { kind: 'FROM_ALLOCATION', ref: origin.bucketId };
    case 'OVERRIDE':
      return {
        kind: 'OVERRIDE',
        original: toBackupOrigin(origin.original),
        projected: origin.projected.cents,
      };
    default:
      return { kind: 'MANUAL' };
  }
}

function toOrigin(origin: BackupEntryOrigin): EntryOrigin {
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
function toLedgerEntry(entry: BackupEntry): LedgerEntry {
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

function toBackupTemplate(template: RecurringTemplate): BackupTemplate {
  return {
    id: template.id,
    name: template.name,
    direction: template.direction,
    dueDayOfMonth: template.dueDayOfMonth,
    amount: template.baseAmount.cents,
    startMonth: template.startMonth,
    endMonth: template.endMonth ?? null,
    status: template.status,
    isEstimate: template.isEstimate,
    valueSchedule: template.valueSchedule.map((step) => ({
      fromMonth: step.fromMonth,
      amount: step.amount.cents,
    })),
  };
}

function toTemplate(template: BackupTemplate): RecurringTemplate {
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

function toBackupBucket(bucket: Bucket): BackupBucket {
  const rule = bucket.rule;

  return {
    id: bucket.id,
    name: bucket.name,
    purpose: bucket.purpose,
    mode: bucket.mode,
    status: bucket.status,
    priority: bucket.priority,
    target:
      bucket.target === undefined
        ? null
        : {
            amount: bucket.target.amount.cents,
            date: bucket.target.date.toISO(),
          },
    rule:
      rule.kind === 'PERCENT'
        ? { kind: 'PERCENT', basisPoints: rule.percentage.basisPoints }
        : { kind: 'FIXED', amount: rule.amount.cents },
    expectedYieldBasisPoints: bucket.expectedYield?.basisPoints ?? null,
    events: bucket.events.map(toBackupEvent),
  };
}

function toBackupEvent(event: BucketEvent): BackupBucketEvent {
  switch (event.kind) {
    case 'CONTRIBUTION':
      return {
        kind: 'CONTRIBUTION',
        id: event.id,
        cycleMonth: event.cycleMonth,
        amount: event.amount.cents,
      };
    case 'OVERRIDE':
      return {
        kind: 'OVERRIDE',
        id: event.id,
        cycleMonth: event.cycleMonth,
        amount: event.amount.cents,
        ruleWouldHaveBeen: event.ruleWouldHaveBeen.cents,
      };
    case 'YIELD':
      return {
        kind: 'YIELD',
        id: event.id,
        date: event.date.toISO(),
        amount: event.amount.cents,
      };
    case 'CORRECTION':
      return {
        kind: 'CORRECTION',
        id: event.id,
        date: event.date.toISO(),
        newBalance: event.newBalance.cents,
        reason: event.reason,
      };
    default:
      return {
        kind: 'WITHDRAWAL',
        id: event.id,
        date: event.date.toISO(),
        amount: event.amount.cents,
        reason: event.reason,
      };
  }
}

function toEvent(event: BackupBucketEvent): BucketEvent {
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

function toBucket(bucket: BackupBucket): Bucket {
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
