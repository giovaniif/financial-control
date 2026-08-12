import { describe, expect, it } from 'vitest';

import type { Account } from '../../domain/budgeting/account.js';
import {
  CycleRef,
  PaydayAnchor,
  ShiftPolicy,
} from '../../domain/budgeting/cycle-ref.js';
import {
  Cycle,
  CycleNotSettled,
  CycleStatus,
} from '../../domain/budgeting/cycle.js';
import { EntryKind, LedgerEntry } from '../../domain/budgeting/ledger-entry.js';
import { noHolidays } from '../../domain/ports/holiday-calendar.js';
import { Money } from '../../domain/shared/money.js';
import {
  InMemoryAccountRepository,
  InMemoryCycleRepository,
  InMemorySettingsRepository,
} from '../testing/fakes.js';
import { FixedClock } from '../testing/fixed-clock.js';
import { CloseCycle, CycleNotOverYet } from './uc-3-8-close-cycle.js';
import { CycleNotFound } from './uc-3-ledger-actions.js';

const anchor = PaydayAnchor.of(5, ShiftPolicy.Preceding);
const ref = (month: string) => CycleRef.forMonth(month, anchor, noHolidays);

/** After the August cycle has ended (it runs 5 Aug – 3 Sep). */
const afterAugust = '2026-09-20T12:00:00Z';

const cycleOf = (month: string, incomeReais: number, opening = 0) =>
  Cycle.open({
    id: `cycle-${month}`,
    ref: ref(month),
    openingBalance: Money.fromCents(opening),
    entries: [
      LedgerEntry.create({
        id: `income-${month}`,
        description: 'Salary',
        kind: EntryKind.Income,
        dueDate: ref(month).start,
        planned: Money.fromCents(incomeReais * 100),
      }),
    ],
  });

const closing = (options: {
  cycles?: Cycle[];
  accounts?: Account[];
  at?: string;
}) => {
  const repository = new InMemoryCycleRepository(options.cycles ?? []);

  return {
    repository,
    useCase: new CloseCycle(
      repository,
      new InMemorySettingsRepository(anchor),
      new InMemoryAccountRepository(options.accounts ?? []),
      noHolidays,
      FixedClock.at(options.at ?? afterAugust),
    ),
  };
};

const settled = (cycle: Cycle) =>
  cycle.entries.reduce<Cycle>(
    (built, entry) => built.skipEntry(entry.id),
    cycle,
  );

describe('CloseCycle.close', () => {
  it('freezes a cycle whose entries are all settled', async () => {
    const { useCase, repository } = closing({
      cycles: [settled(cycleOf('2026-09', 1_000))],
    });

    await useCase.close('2026-09');

    expect((await repository.findByMonth(ref('2026-09')))?.status).toBe(
      CycleStatus.Closed,
    );
  });

  it('refuses while an entry is unsettled', async () => {
    const { useCase } = closing({ cycles: [cycleOf('2026-09', 1_000)] });

    await expect(useCase.close('2026-09')).rejects.toThrow(CycleNotSettled);
  });

  // Offered once the end date has passed, never forced.
  it('refuses a cycle that has not ended yet', async () => {
    const { useCase } = closing({
      cycles: [settled(cycleOf('2026-09', 1_000))],
      at: '2026-08-20T12:00:00Z',
    });

    await expect(useCase.close('2026-09')).rejects.toThrow(CycleNotOverYet);
  });

  it('refuses a cycle that was never materialised', async () => {
    const { useCase } = closing({});

    await expect(useCase.close('2026-09')).rejects.toThrow(CycleNotFound);
  });

  it("pushes its closing balance into the next cycle's opening", async () => {
    const { useCase, repository } = closing({
      cycles: [settled(cycleOf('2026-09', 1_000)), cycleOf('2026-10', 2_000)],
    });

    await useCase.close('2026-09');

    // Everything in August was skipped, so it realised nothing and closes at 0.
    expect(
      (await repository.findByMonth(ref('2026-10')))?.openingBalance.cents,
    ).toBe(0);
  });
});

describe('CloseCycle.previewReopen', () => {
  it('reports nothing to move when no later cycle exists', async () => {
    const { useCase } = closing({
      cycles: [settled(cycleOf('2026-09', 1_000))],
    });

    expect((await useCase.previewReopen('2026-09')).shifts).toEqual([]);
  });

  // Reopening a cycle four cycles back shifts the whole cash curve since,
  // which the user has to see before it happens.
  it('reports every later opening balance that would move', async () => {
    const { useCase } = closing({
      cycles: [
        cycleOf('2026-09', 1_000),
        cycleOf('2026-10', 2_000, 999_999),
        cycleOf('2026-11', 3_000, 999_999),
      ],
    });

    const preview = await useCase.previewReopen('2026-09');

    expect(preview.shifts.map((s) => s.month)).toEqual(['2026-10', '2026-11']);
    expect(preview.shifts[0]?.currentOpeningCents).toBe(999_999);
    expect(preview.shifts[0]?.recomputedOpeningCents).toBe(100_000);
  });

  it('persists nothing', async () => {
    const { useCase, repository } = closing({
      cycles: [cycleOf('2026-09', 1_000), cycleOf('2026-10', 2_000, 999_999)],
    });

    await useCase.previewReopen('2026-09');

    expect(
      (await repository.findByMonth(ref('2026-10')))?.openingBalance.cents,
    ).toBe(999_999);
  });
});

describe('CloseCycle.reopen', () => {
  it('restores editability', async () => {
    const { useCase, repository } = closing({
      cycles: [settled(cycleOf('2026-09', 1_000)).close()],
    });

    await useCase.reopen('2026-09');

    expect((await repository.findByMonth(ref('2026-09')))?.status).toBe(
      CycleStatus.Open,
    );
  });

  it('recomputes every downstream opening balance', async () => {
    const { useCase, repository } = closing({
      cycles: [
        cycleOf('2026-09', 1_000),
        cycleOf('2026-10', 2_000, 999_999),
        cycleOf('2026-11', 3_000, 999_999),
      ],
    });

    await useCase.reopen('2026-09');

    expect(
      (await repository.findByMonth(ref('2026-10')))?.openingBalance.cents,
    ).toBe(100_000);
    // September opens at 1.000 and takes in 2.000, so October opens at 3.000.
    expect(
      (await repository.findByMonth(ref('2026-11')))?.openingBalance.cents,
    ).toBe(300_000);
  });

  it('returns the same shifts the preview reported', async () => {
    const { useCase } = closing({
      cycles: [cycleOf('2026-09', 1_000), cycleOf('2026-10', 2_000, 999_999)],
    });

    const applied = await useCase.reopen('2026-09');

    expect(applied.shifts).toHaveLength(1);
    expect(applied.month).toBe('2026-09');
  });

  it('skips months that were never materialised', async () => {
    const { useCase, repository } = closing({
      cycles: [cycleOf('2026-09', 1_000), cycleOf('2026-12', 3_000, 999_999)],
    });

    await useCase.reopen('2026-09');

    // Nothing exists between them, so November still follows August's close.
    expect(
      (await repository.findByMonth(ref('2026-12')))?.openingBalance.cents,
    ).toBe(100_000);
  });
});
