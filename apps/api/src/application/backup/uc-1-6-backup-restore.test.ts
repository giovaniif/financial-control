import type { BackupDocument } from '@fin/contracts';
import { describe, expect, it } from 'vitest';

import { Account, AccountType } from '../../domain/budgeting/account.js';
import {
  CycleRef,
  PaydayAnchor,
  ShiftPolicy,
} from '../../domain/budgeting/cycle-ref.js';
import { Cycle } from '../../domain/budgeting/cycle.js';
import { EntryKind, LedgerEntry } from '../../domain/budgeting/ledger-entry.js';
import { RecurringTemplate } from '../../domain/budgeting/recurring-template.js';
import { Card } from '../../domain/cards/card.js';
import { Invoice } from '../../domain/cards/invoice.js';
import { Allocation, Bucket } from '../../domain/goals/bucket.js';
import { noHolidays } from '../../domain/ports/holiday-calendar.js';
import { InstallmentRef } from '../../domain/shared/installment-ref.js';
import { LocalDate } from '../../domain/shared/local-date.js';
import { Money } from '../../domain/shared/money.js';
import { Percentage } from '../../domain/shared/percentage.js';
import {
  InMemoryAccountRepository,
  InMemoryBucketRepository,
  InMemoryCardRepository,
  InMemoryCycleRepository,
  InMemorySettingsRepository,
  InMemoryTemplateRepository,
} from '../testing/fakes.js';
import { FixedClock } from '../testing/fixed-clock.js';
import {
  BackupVersionNotSupported,
  BackupRestore,
} from './uc-1-6-backup-restore.js';

const anchor = PaydayAnchor.of(5, ShiftPolicy.Preceding);
const refFor = (month: string) => CycleRef.forMonth(month, anchor, noHolidays);
const date = (iso: string) => LocalDate.parse(iso);

function populated() {
  const august = refFor('2026-08');

  const cycles = new InMemoryCycleRepository([
    Cycle.rehydrate({
      id: '2026-08',
      ref: august,
      status: 'OPEN',
      openingBalance: Money.fromCents(216_000),
      entries: [
        LedgerEntry.create({
          id: 'e-salary',
          description: 'Salary',
          kind: EntryKind.Income,
          dueDate: august.start,
          planned: Money.fromCents(1_800_000),
          origin: { kind: 'FROM_TEMPLATE', templateId: 't-salary' },
        }).settle(Money.fromCents(1_800_000), 'RECEIVED'),
        // The nested origin is the case most likely to be silently dropped.
        LedgerEntry.create({
          id: 'e-renovation',
          description: 'Renovation Progress',
          kind: EntryKind.Fixed,
          dueDate: date('2026-08-15'),
          planned: Money.fromCents(-280_000),
          isEstimate: true,
          origin: {
            kind: 'OVERRIDE',
            original: { kind: 'FROM_TEMPLATE', templateId: 't-renovation' },
            projected: Money.fromCents(-265_000),
          },
        }),
        LedgerEntry.create({
          id: 'e-skipped',
          description: 'Snooker',
          kind: EntryKind.Fixed,
          dueDate: date('2026-08-20'),
          planned: Money.fromCents(-12_000),
        }).skip(),
        // Every origin has to survive, not just the two common ones.
        LedgerEntry.create({
          id: 'e-invoice',
          description: 'Inter invoice',
          kind: EntryKind.Invoice,
          dueDate: date('2026-08-10'),
          planned: Money.fromCents(-240_000),
          origin: { kind: 'FROM_INVOICE', invoiceId: 'i-aug' },
        }).settle(Money.fromCents(-235_000), 'PAID'),
        LedgerEntry.create({
          id: 'e-allocation',
          description: 'Apartment',
          kind: EntryKind.Allocation,
          dueDate: date('2026-08-31'),
          planned: Money.fromCents(-177_800),
          origin: { kind: 'FROM_ALLOCATION', bucketId: 'b-apartment' },
        }),
        LedgerEntry.create({
          id: 'e-overdue',
          description: 'Electricity',
          kind: EntryKind.Fixed,
          dueDate: date('2026-08-08'),
          planned: Money.fromCents(-28_000),
        }).markOverdue(),
      ],
    }),
  ]);

  const accounts = new InMemoryAccountRepository([
    Account.open({
      id: 'a-inter',
      name: 'Inter',
      type: AccountType.Checking,
      balance: Money.fromCents(216_000),
    }),
  ]);

  const templates = new InMemoryTemplateRepository([
    RecurringTemplate.create({
      id: 't-salary',
      name: 'Salary',
      direction: 'IN',
      dueDayOfMonth: 5,
      amount: Money.fromCents(1_000_000),
      startMonth: '2026-01',
      endMonth: '2027-01',
      isEstimate: false,
      status: 'ACTIVE',
      valueSchedule: [
        { fromMonth: '2026-09', amount: Money.fromCents(1_800_000) },
      ],
    }),
  ]);

  const cards = new InMemoryCardRepository([
    Card.open({
      id: 'c-inter',
      name: 'Inter',
      limit: Money.fromCents(2_500_000),
      closingDay: 28,
      dueDay: 10,
      paymentAccountId: 'a-inter',
      invoices: [
        Invoice.open({
          id: 'i-aug',
          periodStart: date('2026-07-29'),
          periodEnd: date('2026-08-28'),
          dueDate: date('2026-09-10'),
          status: 'PAID',
          paidAmount: Money.fromCents(-235_000),
          items: [
            {
              id: 'it-1',
              purchaseId: 'p-sofa',
              description: 'Sofa',
              purchasedOn: date('2026-08-20'),
              amount: Money.fromCents(-30_000),
              installment: InstallmentRef.of(1, 10),
            },
            {
              id: 'it-2',
              purchaseId: 'p-refund',
              description: 'Returned lamp',
              purchasedOn: date('2026-08-22'),
              amount: Money.fromCents(15_000),
              installment: undefined,
            },
          ],
        }),
      ],
      plans: [
        {
          purchaseId: 'p-sofa',
          description: 'Sofa',
          purchasedOn: date('2026-08-20'),
          total: Money.fromCents(-300_000),
          totalInstallments: 10,
        },
      ],
    }),
  ]);

  const buckets = new InMemoryBucketRepository([
    Bucket.goal({
      id: 'b-apartment',
      name: 'Apartment',
      purpose: 'The flat',
      rule: Allocation.percentOfExpectedSurplus(Percentage.ofBasisPoints(2000)),
      priority: 1,
      status: 'ACTIVE',
      expectedYield: Percentage.ofBasisPoints(800),
      target: { amount: Money.fromCents(15_000_000), date: date('2031-03-31') },
      events: [
        {
          kind: 'CONTRIBUTION',
          id: 'ev-1',
          cycleMonth: '2026-08',
          amount: Money.fromCents(177_800),
        },
        {
          kind: 'CORRECTION',
          id: 'ev-2',
          date: date('2026-08-31'),
          newBalance: Money.fromCents(1_578_344),
          reason: 'Matched to the statement',
        },
        // All five kinds, because a log that loses one is not a log.
        {
          kind: 'OVERRIDE',
          id: 'ev-3',
          cycleMonth: '2026-09',
          amount: Money.fromCents(700_000),
          ruleWouldHaveBeen: Money.fromCents(177_800),
        },
        {
          kind: 'YIELD',
          id: 'ev-4',
          date: date('2026-09-30'),
          amount: Money.fromCents(4_580),
        },
        {
          kind: 'WITHDRAWAL',
          id: 'ev-5',
          date: date('2026-10-05'),
          amount: Money.fromCents(50_000),
          reason: 'Notary fees',
        },
      ],
    }),
    Bucket.ongoing({
      id: 'b-investments',
      name: 'Investments',
      purpose: '',
      rule: Allocation.fixed(Money.fromCents(100_000)),
      priority: 2,
      status: 'ARCHIVED',
      events: [],
    }),
  ]);

  const settings = new InMemorySettingsRepository(anchor);

  return {
    repositories: { cycles, accounts, templates, cards, buckets, settings },
    service: new BackupRestore(
      cycles,
      accounts,
      templates,
      cards,
      buckets,
      settings,
      noHolidays,
      FixedClock.at('2026-08-11T12:00:00Z'),
    ),
  };
}

function empty() {
  const cycles = new InMemoryCycleRepository();
  const accounts = new InMemoryAccountRepository();
  const templates = new InMemoryTemplateRepository();
  const cards = new InMemoryCardRepository();
  const buckets = new InMemoryBucketRepository();
  const settings = new InMemorySettingsRepository(
    PaydayAnchor.of(1, ShiftPolicy.Following),
  );

  return {
    repositories: { cycles, accounts, templates, cards, buckets, settings },
    service: new BackupRestore(
      cycles,
      accounts,
      templates,
      cards,
      buckets,
      settings,
      noHolidays,
      FixedClock.at('2026-08-11T12:00:00Z'),
    ),
  };
}

describe('BackupRestore.export', () => {
  it('stamps the version and the moment it was taken', async () => {
    const document = await populated().service.export();

    expect(document.version).toBe(1);
    expect(document.exportedAt).toBe('2026-08-11T12:00:00.000Z');
  });

  it('carries the payday anchor, which everything else is sliced by', async () => {
    const document = await populated().service.export();

    expect(document.anchor).toEqual({
      anchorDay: 5,
      shiftPolicy: 'PRECEDING',
    });
  });

  it('carries every cycle that exists, with its entries', async () => {
    const document = await populated().service.export();

    expect(document.cycles).toHaveLength(1);
    expect(document.cycles[0]?.entries).toHaveLength(6);
  });

  it('keeps money as integer cents', async () => {
    const document = await populated().service.export();

    expect(document.cycles[0]?.openingBalance).toBe(216_000);
    expect(document.accounts[0]?.balance).toBe(216_000);
    expect(Number.isInteger(document.cycles[0]?.entries[0]?.planned)).toBe(
      true,
    );
  });
});

describe('BackupRestore round trip', () => {
  async function roundTrip() {
    const source = populated();
    const document = await source.service.export();

    // Into a different, empty installation: a restore is a recovery, not a
    // merge into whatever happens to be there.
    const target = empty();
    await target.service.restore(document);

    return { document, target, again: await target.service.export() };
  }

  it('is lossless', async () => {
    const { document, again } = await roundTrip();

    expect(again).toEqual(document);
  });

  it('restores the anchor, so every cycle is sliced the same way', async () => {
    const { target } = await roundTrip();

    const restored = await target.repositories.settings.load();

    expect(restored.dayOfMonth).toBe(5);
    expect(restored.shiftPolicy).toBe('PRECEDING');
  });

  it('restores a settled entry as settled, with its actual', async () => {
    const { again } = await roundTrip();
    const salary = again.cycles[0]?.entries.find(
      (entry) => entry.id === 'e-salary',
    );

    expect(salary?.status).toBe('RECEIVED');
    expect(salary?.actual).toBe(1_800_000);
  });

  it('restores a skipped entry as skipped', async () => {
    const { again } = await roundTrip();

    expect(
      again.cycles[0]?.entries.find((entry) => entry.id === 'e-skipped')
        ?.status,
    ).toBe('SKIPPED');
  });

  // The nested origin: what was overridden, and what it would have projected.
  it('restores an override with the origin underneath it', async () => {
    const { again } = await roundTrip();
    const entry = again.cycles[0]?.entries.find(
      (each) => each.id === 'e-renovation',
    );

    expect(entry?.origin).toEqual({
      kind: 'OVERRIDE',
      original: { kind: 'FROM_TEMPLATE', ref: 't-renovation' },
      projected: -265_000,
    });
    expect(entry?.isEstimate).toBe(true);
  });

  it('restores a template with its value schedule', async () => {
    const { target } = await roundTrip();
    const [template] = await target.repositories.templates.findAll();

    expect(template?.valueSchedule).toEqual([
      { fromMonth: '2026-09', amount: Money.fromCents(1_800_000) },
    ]);
    expect(template?.endMonth).toBe('2027-01');
  });

  it('restores a card with its instalment plan', async () => {
    const { target } = await roundTrip();
    const [card] = await target.repositories.cards.findAll();

    expect(card?.plans[0]?.totalInstallments).toBe(10);
    expect(card?.plans[0]?.total).toEqual(Money.fromCents(-300_000));
  });

  it('restores a goal with its target and its whole event log', async () => {
    const { target } = await roundTrip();
    const buckets = await target.repositories.buckets.findAll();
    const apartment = buckets.find((bucket) => bucket.id === 'b-apartment');

    expect(apartment?.target?.amount).toEqual(Money.fromCents(15_000_000));
    expect(apartment?.events.map((event) => event.kind)).toEqual([
      'CONTRIBUTION',
      'CORRECTION',
      'OVERRIDE',
      'YIELD',
      'WITHDRAWAL',
    ]);
    expect(apartment?.events[1]).toMatchObject({
      kind: 'CORRECTION',
      reason: 'Matched to the statement',
    });
    expect(apartment?.events[4]).toMatchObject({
      kind: 'WITHDRAWAL',
      reason: 'Notary fees',
    });
  });

  // GOAL and ONGOING are a real invariant, not a display flag.
  it('restores an ongoing bucket without inventing a target', async () => {
    const { target } = await roundTrip();
    const buckets = await target.repositories.buckets.findAll();
    const investments = buckets.find((each) => each.id === 'b-investments');

    expect(investments?.mode).toBe('ONGOING');
    expect(investments?.target).toBeUndefined();
    expect(investments?.status).toBe('ARCHIVED');
  });

  it('replaces what was there rather than merging into it', async () => {
    const source = populated();
    const document = await source.service.export();

    const target = populated();
    await target.repositories.accounts.save(
      Account.open({
        id: 'a-stale',
        name: 'Old account',
        type: AccountType.Cash,
        balance: Money.fromCents(999),
      }),
    );
    await target.service.restore(document);

    const accounts = await target.repositories.accounts.findAll();

    expect(accounts.map((account) => account.id)).toEqual(['a-inter']);
  });
});

describe('BackupRestore.restore', () => {
  it('refuses a version it does not understand', async () => {
    const { service } = empty();
    const document = { version: 99, cycles: [] } as unknown as BackupDocument;

    await expect(service.restore(document)).rejects.toBeInstanceOf(
      BackupVersionNotSupported,
    );
  });

  it('says which version it found and which it expected', async () => {
    const { service } = empty();
    const document = { version: 99 } as unknown as BackupDocument;

    await expect(service.restore(document)).rejects.toThrow(/99.*1|1.*99/);
  });

  it('leaves the data untouched when the version is refused', async () => {
    const { service, repositories } = populated();

    await expect(
      service.restore({ version: 99 } as unknown as BackupDocument),
    ).rejects.toBeInstanceOf(BackupVersionNotSupported);

    expect(await repositories.accounts.findAll()).toHaveLength(1);
  });
});
