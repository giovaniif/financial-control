import { describe, expect, it } from 'vitest';

import { AccountType } from '../../domain/budgeting/account.js';
import {
  CycleRef,
  PaydayAnchor,
  ShiftPolicy,
} from '../../domain/budgeting/cycle-ref.js';
import type { Cycle } from '../../domain/budgeting/cycle.js';
import type { LedgerEntry } from '../../domain/budgeting/ledger-entry.js';
import { noHolidays } from '../../domain/ports/holiday-calendar.js';
import { Money } from '../../domain/shared/money.js';
import {
  InMemoryAccountRepository,
  InMemoryBucketRepository,
  InMemoryCycleRepository,
  InMemorySettingsRepository,
  InMemoryTemplateRepository,
} from '../testing/fakes.js';
import type { SetupDocument } from './setup-document.js';
import { WriteSetupDocument } from './write-setup-document.js';

const anchor = PaydayAnchor.of(5, ShiftPolicy.Preceding);
const refFor = (month: string) => CycleRef.forMonth(month, anchor, noHolidays);

function wire() {
  const cycles = new InMemoryCycleRepository();
  const accounts = new InMemoryAccountRepository();
  const templates = new InMemoryTemplateRepository();
  const buckets = new InMemoryBucketRepository();
  // Deliberately not the document's anchor: writing has to move it.
  const settings = new InMemorySettingsRepository(
    PaydayAnchor.of(1, ShiftPolicy.Following),
  );

  return {
    cycles,
    accounts,
    templates,
    buckets,
    settings,
    write: new WriteSetupDocument(
      cycles,
      accounts,
      templates,
      buckets,
      settings,
      noHolidays,
    ),
  };
}

/**
 * A document carrying one of every case that has ever been silently dropped
 * in the mapping: a settled entry, a skipped one, an override with its
 * original origin underneath, a template with a value schedule, and a goal
 * with the full event log its balance folds over.
 */
const document = (overrides: Partial<SetupDocument> = {}): SetupDocument => ({
  composedAt: '2026-08-11T12:00:00.000Z',
  anchor: { anchorDay: 5, shiftPolicy: 'PRECEDING' },
  accounts: [
    { id: 'a-inter', name: 'Inter', type: 'CHECKING', balance: 216_000 },
  ],
  cycles: [
    {
      month: '2026-08',
      status: 'OPEN',
      openingBalance: 216_000,
      entries: [
        {
          id: 'e-salary',
          description: 'Salary',
          kind: 'INCOME',
          dueDate: '2026-07-03',
          planned: 1_800_000,
          actual: 1_800_000,
          status: 'RECEIVED',
          isEstimate: false,
          origin: { kind: 'FROM_TEMPLATE', ref: 't-salary' },
        },
        {
          id: 'e-gym',
          description: 'Gym',
          kind: 'FIXED',
          dueDate: '2026-07-18',
          planned: -12_000,
          actual: null,
          status: 'SKIPPED',
          isEstimate: false,
          origin: { kind: 'MANUAL' },
        },
        {
          id: 'e-renovation',
          description: 'Renovation Progress',
          kind: 'FIXED',
          dueDate: '2026-07-15',
          planned: -280_000,
          actual: null,
          status: 'PENDING',
          isEstimate: true,
          origin: {
            kind: 'OVERRIDE',
            original: { kind: 'FROM_TEMPLATE', ref: 't-renovation' },
            projected: -120_000,
          },
        },
      ],
    },
  ],
  templates: [
    {
      id: 't-salary',
      name: 'Salary',
      direction: 'IN',
      dueDayOfMonth: 5,
      amount: 1_000_000,
      startMonth: '2026-02',
      endMonth: '2027-01',
      status: 'ACTIVE',
      isEstimate: false,
      valueSchedule: [{ fromMonth: '2026-09', amount: 1_800_000 }],
    },
  ],
  buckets: [
    {
      id: 'b-apartment',
      name: 'Apartment',
      purpose: 'A place of our own',
      mode: 'GOAL',
      status: 'ACTIVE',
      priority: 1,
      target: { amount: 15_000_000, date: '2031-03-31' },
      rule: { kind: 'FIXED', amount: 177_800 },
      expectedYieldBasisPoints: 800,
      events: [
        {
          kind: 'CONTRIBUTION',
          id: 'ev-1',
          cycleMonth: '2026-08',
          amount: 177_800,
        },
        {
          kind: 'CORRECTION',
          id: 'ev-2',
          date: '2026-08-20',
          newBalance: 200_000,
          reason: 'extrato do banco',
        },
      ],
    },
  ],
  ...overrides,
});

describe('WriteSetupDocument', () => {
  // Everything else is sliced by it, so writing entries against the old
  // anchor would file them in the wrong months.
  it('moves the payday anchor before anything is sliced by it', async () => {
    const wired = wire();

    await wired.write.write(document());

    const stored = await wired.settings.load();
    expect(stored.dayOfMonth).toBe(5);
    expect(stored.shiftPolicy).toBe(ShiftPolicy.Preceding);
  });

  it('writes the accounts as they were stated', async () => {
    const wired = wire();

    await wired.write.write(document());

    const [account] = await wired.accounts.findAll();
    expect(account?.name).toBe('Inter');
    expect(account?.type).toBe(AccountType.Checking);
    expect(account?.balance).toEqual(Money.fromCents(216_000));
  });

  it('writes a settled entry as settled, with what was actually paid', async () => {
    const wired = wire();

    await wired.write.write(document());

    const entry = await entryFrom(wired, 'e-salary');
    expect(entry?.status).toBe('RECEIVED');
    expect(entry?.amount.actual).toEqual(Money.fromCents(1_800_000));
  });

  it('writes a skipped entry as skipped', async () => {
    const wired = wire();

    await wired.write.write(document());

    expect((await entryFrom(wired, 'e-gym'))?.status).toBe('SKIPPED');
  });

  /** The nested origin is the case most likely to be silently flattened. */
  it('writes an override with the origin still underneath it', async () => {
    const wired = wire();

    await wired.write.write(document());

    const entry = await entryFrom(wired, 'e-renovation');
    expect(entry?.origin).toEqual({
      kind: 'OVERRIDE',
      original: { kind: 'FROM_TEMPLATE', templateId: 't-renovation' },
      projected: Money.fromCents(-120_000),
    });
    expect(entry?.isEstimate).toBe(true);
  });

  it('writes a template with its value schedule intact', async () => {
    const wired = wire();

    await wired.write.write(document());

    const [template] = await wired.templates.findAll();
    expect(template?.valueSchedule).toEqual([
      { fromMonth: '2026-09', amount: Money.fromCents(1_800_000) },
    ]);
    expect(template?.endMonth).toBe('2027-01');
  });

  /** UC-6.7 — the balance is the fold, so every event has to survive. */
  it('writes a goal with its target and its whole event log', async () => {
    const wired = wire();

    await wired.write.write(document());

    const [bucket] = await wired.buckets.findAll();
    expect(bucket?.mode).toBe('GOAL');
    expect(bucket?.events).toHaveLength(2);
    expect(bucket?.balance).toEqual(Money.fromCents(200_000));
  });

  it('writes an ongoing bucket without inventing a target', async () => {
    const wired = wire();

    await wired.write.write(
      document({
        buckets: document().buckets.map((bucket) => ({
          ...bucket,
          mode: 'ONGOING' as const,
          target: null,
          events: [],
        })),
      }),
    );

    const [bucket] = await wired.buckets.findAll();
    expect(bucket?.mode).toBe('ONGOING');
  });

  /**
   * A document is the whole state, not a patch: writing one over an
   * installation that already holds data must leave only what the document
   * says.
   */
  it('replaces what was there rather than merging into it', async () => {
    const wired = wire();

    await wired.write.write(
      document({
        accounts: [
          { id: 'a-old', name: 'Old', type: 'CASH', balance: 1 },
          { id: 'a-older', name: 'Older', type: 'CASH', balance: 2 },
        ],
      }),
    );
    await wired.write.write(document());

    const accounts = await wired.accounts.findAll();
    expect(accounts.map((account) => account.name)).toEqual(['Inter']);
  });
});

async function entryFrom(
  wired: ReturnType<typeof wire>,
  id: string,
): Promise<LedgerEntry | undefined> {
  const cycle: Cycle | undefined = await wired.cycles.findByMonth(
    refFor('2026-08'),
  );

  return cycle?.entries.find((entry) => entry.id === id);
}
