import { describe, expect, it } from 'vitest';

import {
  CycleRef,
  PaydayAnchor,
  ShiftPolicy,
} from '../../domain/budgeting/cycle-ref.js';
import {
  Cycle,
  CycleClosed,
  EntryNotFound,
  EntryNotInCycle,
} from '../../domain/budgeting/cycle.js';
import {
  EntryKind,
  LedgerEntry,
  Origin,
} from '../../domain/budgeting/ledger-entry.js';
import { noHolidays } from '../../domain/ports/holiday-calendar.js';
import { LocalDate } from '../../domain/shared/local-date.js';
import { Money } from '../../domain/shared/money.js';
import { SettlementStatus } from '../../domain/shared/planned-actual.js';
import {
  InMemoryCycleRepository,
  InMemorySettingsRepository,
} from '../testing/fakes.js';
import { CycleNotFound, LedgerActions } from './uc-3-ledger-actions.js';

const anchor = PaydayAnchor.of(5, ShiftPolicy.Preceding);
const august = CycleRef.forMonth('2026-08', anchor, noHolidays);

const populated = () =>
  Cycle.open({
    id: 'cycle-aug',
    ref: august,
    openingBalance: Money.zero(),
    entries: [
      LedgerEntry.create({
        id: 'e-health',
        description: 'Health Plan',
        kind: EntryKind.Fixed,
        dueDate: LocalDate.parse('2026-08-08'),
        planned: Money.fromCents(-32_000),
        origin: Origin.fromTemplate('tpl-health'),
      }),
    ],
  });

const acting = (...cycles: Cycle[]) => {
  const repository = new InMemoryCycleRepository(cycles);
  let next = 0;

  return {
    repository,
    actions: new LedgerActions(
      repository,
      new InMemorySettingsRepository(anchor),
      noHolidays,
      () => `entry-${String(++next)}`,
    ),
  };
};

const reload = async (repository: InMemoryCycleRepository) =>
  repository.findByMonth(august);

describe('LedgerActions.settle', () => {
  // One click when the actual matches the plan: that is the whole point.
  it('settles at the planned amount when no actual is given', async () => {
    const { actions, repository } = acting(populated());

    await actions.settle({
      month: '2026-08',
      entryId: 'e-health',
      status: SettlementStatus.Paid,
    });

    const entry = (await reload(repository))?.entries[0];
    expect(entry?.status).toBe(SettlementStatus.Paid);
    expect(entry?.amount.actual?.cents).toBe(-32_000);
    expect(entry?.amount.variance?.isZero()).toBe(true);
  });

  it('records an actual amount that differs from the plan', async () => {
    const { actions, repository } = acting(populated());

    await actions.settle({
      month: '2026-08',
      entryId: 'e-health',
      status: SettlementStatus.Paid,
      actualCents: -33_016,
    });

    const entry = (await reload(repository))?.entries[0];
    expect(entry?.amount.actual?.cents).toBe(-33_016);
    expect(entry?.amount.variance?.cents).toBe(-1_016);
  });

  it('settles money coming in as received', async () => {
    const cycle = populated().addEntry(
      LedgerEntry.create({
        id: 'e-salary',
        description: 'Salary',
        kind: EntryKind.Income,
        dueDate: LocalDate.parse('2026-08-05'),
        planned: Money.fromCents(1_800_000),
      }),
    );
    const { actions, repository } = acting(cycle);

    await actions.settle({
      month: '2026-08',
      entryId: 'e-salary',
      status: SettlementStatus.Received,
    });

    const entry = (await reload(repository))?.entries.find(
      (e) => e.id === 'e-salary',
    );
    expect(entry?.status).toBe(SettlementStatus.Received);
  });

  it('skips an entry, realising nothing', async () => {
    const { actions, repository } = acting(populated());

    await actions.skip('2026-08', 'e-health');

    const entry = (await reload(repository))?.entries[0];
    expect(entry?.status).toBe(SettlementStatus.Skipped);
    expect(entry?.realised.isZero()).toBe(true);
  });

  it('refuses an entry that is not there', async () => {
    const { actions } = acting(populated());

    await expect(
      actions.settle({
        month: '2026-08',
        entryId: 'missing',
        status: SettlementStatus.Paid,
      }),
    ).rejects.toThrow(EntryNotFound);
  });

  it('refuses a cycle that has never been materialised', async () => {
    const { actions } = acting();

    await expect(
      actions.settle({
        month: '2026-08',
        entryId: 'e-health',
        status: SettlementStatus.Paid,
      }),
    ).rejects.toThrow(CycleNotFound);
  });
});

describe('LedgerActions.addEntry', () => {
  it('adds a one-off no template covers', async () => {
    const { actions, repository } = acting(populated());

    const id = await actions.addEntry({
      month: '2026-08',
      description: 'Dinner split',
      kind: EntryKind.Variable,
      dueDate: '2026-08-14',
      amountCents: 12_000,
    });

    const entries = (await reload(repository))?.entries ?? [];
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.id === id)?.description).toBe('Dinner split');
  });

  it('marks it as entered by hand', async () => {
    const { actions, repository } = acting(populated());

    const id = await actions.addEntry({
      month: '2026-08',
      description: 'Gift',
      kind: EntryKind.Variable,
      dueDate: '2026-08-14',
      amountCents: 5_000,
    });

    const entry = (await reload(repository))?.entries.find((e) => e.id === id);
    expect(entry?.origin).toEqual({ kind: 'MANUAL' });
  });

  it('refuses an entry due outside the cycle', async () => {
    const { actions } = acting(populated());

    await expect(
      actions.addEntry({
        month: '2026-08',
        description: 'Too late',
        kind: EntryKind.Variable,
        dueDate: '2026-09-20',
        amountCents: 1_000,
      }),
    ).rejects.toThrow(EntryNotInCycle);
  });

  it('removes an entry', async () => {
    const { actions, repository } = acting(populated());

    await actions.removeEntry('2026-08', 'e-health');

    expect((await reload(repository))?.entries).toHaveLength(0);
  });
});

describe('LedgerActions.override', () => {
  it('changes the figure without touching the template', async () => {
    const { actions, repository } = acting(populated());

    await actions.override('2026-08', 'e-health', -45_000);

    const entry = (await reload(repository))?.entries[0];
    expect(entry?.amount.planned.cents).toBe(-45_000);
    expect(entry?.isOverridden).toBe(true);
  });

  it('reverts to what the template said', async () => {
    const { actions, repository } = acting(populated());

    await actions.override('2026-08', 'e-health', -45_000);
    await actions.revertOverride('2026-08', 'e-health');

    const entry = (await reload(repository))?.entries[0];
    expect(entry?.amount.planned.cents).toBe(-32_000);
    expect(entry?.isOverridden).toBe(false);
  });
});

describe('LedgerActions on a closed cycle', () => {
  const closed = () => populated().skipEntry('e-health').close();

  it.each([
    [
      'settling',
      (a: LedgerActions) =>
        a.settle({
          month: '2026-08',
          entryId: 'e-health',
          status: SettlementStatus.Paid,
        }),
    ],
    [
      'adding',
      (a: LedgerActions) =>
        a.addEntry({
          month: '2026-08',
          description: 'Late',
          kind: EntryKind.Variable,
          dueDate: '2026-08-20',
          amountCents: 100,
        }),
    ],
    ['overriding', (a: LedgerActions) => a.override('2026-08', 'e-health', -1)],
    ['removing', (a: LedgerActions) => a.removeEntry('2026-08', 'e-health')],
  ])('refuses %s', async (_name, act) => {
    const { actions } = acting(closed());

    await expect(act(actions)).rejects.toThrow(CycleClosed);
  });
});
