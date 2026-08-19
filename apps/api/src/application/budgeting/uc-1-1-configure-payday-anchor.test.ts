import { beforeEach, describe, expect, it } from 'vitest';

import {
  CycleRef,
  PaydayAnchor,
  ShiftPolicy,
} from '../../domain/budgeting/cycle-ref.js';
import { Cycle } from '../../domain/budgeting/cycle.js';
import { EntryKind, LedgerEntry } from '../../domain/budgeting/ledger-entry.js';
import { noHolidays } from '../../domain/ports/holiday-calendar.js';
import { LocalDate } from '../../domain/shared/local-date.js';
import { Money } from '../../domain/shared/money.js';
import {
  InMemoryCycleRepository,
  InMemorySettingsRepository,
} from '../testing/fakes.js';
import { FixedClock } from '../testing/fixed-clock.js';
import {
  AnchorChangeWouldOrphanEntries,
  ConfigurePaydayAnchor,
} from './uc-1-1-configure-payday-anchor.js';

const clock = FixedClock.at('2026-08-10T12:00:00Z');
const anchorFive = PaydayAnchor.of(5, ShiftPolicy.Preceding);

const entry = (id: string, dueDate: string) =>
  LedgerEntry.create({
    id,
    description: id,
    kind: EntryKind.Fixed,
    dueDate: LocalDate.parse(dueDate),
    planned: Money.fromCents(-10_000),
  });

const augustWith = (...dueDates: string[]) => {
  const ref = CycleRef.forMonth('2026-09', anchorFive, noHolidays);

  return Cycle.open({
    id: 'cycle-sep',
    ref,
    openingBalance: Money.zero(),
    entries: dueDates.map((due, i) => entry(`e${String(i)}`, due)),
  });
};

describe('ConfigurePaydayAnchor.read', () => {
  it('reports the stored anchor', async () => {
    const useCase = new ConfigurePaydayAnchor(
      new InMemorySettingsRepository(PaydayAnchor.of(7, ShiftPolicy.Following)),
      new InMemoryCycleRepository(),
      noHolidays,
      clock,
    );

    expect(await useCase.read()).toEqual({
      anchorDay: 7,
      shiftPolicy: ShiftPolicy.Following,
    });
  });
});

describe('ConfigurePaydayAnchor.preview', () => {
  let cycles: InMemoryCycleRepository;
  let settings: InMemorySettingsRepository;
  let useCase: ConfigurePaydayAnchor;

  beforeEach(() => {
    // The September cycle under anchor 5 runs 5 Aug – 3 Sep.
    cycles = new InMemoryCycleRepository([
      augustWith('2026-08-06', '2026-08-20', '2026-09-02'),
    ]);
    settings = new InMemorySettingsRepository(anchorFive);
    useCase = new ConfigurePaydayAnchor(settings, cycles, noHolidays, clock);
  });

  it('reports nothing moving when the anchor is unchanged', async () => {
    const preview = await useCase.preview({
      anchorDay: 5,
      shiftPolicy: ShiftPolicy.Preceding,
    });

    expect(preview.totalEntriesMoving).toBe(0);
    expect(preview.shifts).toHaveLength(0);
  });

  it('counts the entries a later anchor would push out of their cycle', async () => {
    // Anchor 10 makes September run 10 Aug – 9 Sep, so the 6 Aug entry leaves.
    const preview = await useCase.preview({
      anchorDay: 10,
      shiftPolicy: ShiftPolicy.Preceding,
    });

    expect(preview.totalEntriesMoving).toBe(1);
    expect(preview.shifts[0]?.month).toBe('2026-09');
    expect(preview.shifts[0]?.entriesLeaving).toBe(1);
  });

  it('shows both the current and the proposed range', async () => {
    const preview = await useCase.preview({
      anchorDay: 10,
      shiftPolicy: ShiftPolicy.Preceding,
    });

    expect(preview.shifts[0]?.currentRange).toBe('2026-08-05 – 2026-09-03');
    expect(preview.shifts[0]?.proposedRange).toBe('2026-08-10 – 2026-09-09');
  });

  it('reports the current anchor alongside the proposed one', async () => {
    const preview = await useCase.preview({
      anchorDay: 10,
      shiftPolicy: ShiftPolicy.Following,
    });

    expect(preview.current).toEqual({
      anchorDay: 5,
      shiftPolicy: ShiftPolicy.Preceding,
    });
    expect(preview.proposed).toEqual({
      anchorDay: 10,
      shiftPolicy: ShiftPolicy.Following,
    });
  });

  it('persists nothing', async () => {
    await useCase.preview({
      anchorDay: 10,
      shiftPolicy: ShiftPolicy.Following,
    });

    expect((await settings.load()).dayOfMonth).toBe(5);
    expect(cycles.saved[0]?.ref.start.toISO()).toBe('2026-08-05');
  });

  it('leaves closed cycles out of the count entirely', async () => {
    const closedAugust = augustWith('2026-08-06').skipEntry('e0').close();
    const closedOnly = new InMemoryCycleRepository([closedAugust]);
    const onClosed = new ConfigurePaydayAnchor(
      settings,
      closedOnly,
      noHolidays,
      clock,
    );

    const preview = await onClosed.preview({
      anchorDay: 10,
      shiftPolicy: ShiftPolicy.Preceding,
    });

    expect(preview.totalEntriesMoving).toBe(0);
  });

  it('flags an entry that would fall outside every open cycle', async () => {
    // Only August is materialised, so an entry pushed past its new end has
    // nowhere in the open window to land.
    const preview = await useCase.preview({
      anchorDay: 10,
      shiftPolicy: ShiftPolicy.Preceding,
    });

    expect(preview.orphanedEntries).toBe(1);
  });
});

describe('ConfigurePaydayAnchor.change', () => {
  it('stores the new anchor', async () => {
    const settings = new InMemorySettingsRepository(anchorFive);
    const useCase = new ConfigurePaydayAnchor(
      settings,
      new InMemoryCycleRepository([augustWith('2026-08-20')]),
      noHolidays,
      clock,
    );

    await useCase.change({ anchorDay: 7, shiftPolicy: ShiftPolicy.Following });

    const stored = await settings.load();
    expect(stored.dayOfMonth).toBe(7);
    expect(stored.shiftPolicy).toBe(ShiftPolicy.Following);
  });

  it('re-slices the open cycle onto the new boundaries', async () => {
    const cycles = new InMemoryCycleRepository([augustWith('2026-08-20')]);
    const useCase = new ConfigurePaydayAnchor(
      new InMemorySettingsRepository(anchorFive),
      cycles,
      noHolidays,
      clock,
    );

    await useCase.change({ anchorDay: 10, shiftPolicy: ShiftPolicy.Preceding });

    const september = cycles.saved.find((c) => c.ref.month === '2026-09');
    expect(september?.ref.start.toISO()).toBe('2026-08-10');
    expect(september?.entries).toHaveLength(1);
  });

  it('never re-slices a closed cycle', async () => {
    const closed = augustWith('2026-08-20').skipEntry('e0').close();
    const cycles = new InMemoryCycleRepository([closed]);
    const useCase = new ConfigurePaydayAnchor(
      new InMemorySettingsRepository(anchorFive),
      cycles,
      noHolidays,
      clock,
    );

    await useCase.change({ anchorDay: 10, shiftPolicy: ShiftPolicy.Preceding });

    expect(cycles.saved[0]?.ref.start.toISO()).toBe('2026-08-05');
  });

  it('returns the same summary the preview gave', async () => {
    const useCase = new ConfigurePaydayAnchor(
      new InMemorySettingsRepository(anchorFive),
      new InMemoryCycleRepository([augustWith('2026-08-20')]),
      noHolidays,
      clock,
    );

    const applied = await useCase.change({
      anchorDay: 10,
      shiftPolicy: ShiftPolicy.Preceding,
    });

    expect(applied.totalEntriesMoving).toBe(0);
  });

  // The preview warns about these; applying anyway would either drop the
  // entry or leave it in a cycle whose range no longer contains it.
  it('refuses a change that would orphan an entry', async () => {
    const useCase = new ConfigurePaydayAnchor(
      new InMemorySettingsRepository(anchorFive),
      new InMemoryCycleRepository([augustWith('2026-08-06', '2026-08-20')]),
      noHolidays,
      clock,
    );

    await expect(
      useCase.change({ anchorDay: 10, shiftPolicy: ShiftPolicy.Preceding }),
    ).rejects.toThrow(AnchorChangeWouldOrphanEntries);
  });

  it('counts the orphans in the plural when there is more than one', async () => {
    const useCase = new ConfigurePaydayAnchor(
      new InMemorySettingsRepository(anchorFive),
      new InMemoryCycleRepository([
        augustWith('2026-08-06', '2026-08-07', '2026-08-20'),
      ]),
      noHolidays,
      clock,
    );

    await expect(
      useCase.change({ anchorDay: 10, shiftPolicy: ShiftPolicy.Preceding }),
    ).rejects.toThrow(/2 lançamentos/);
  });

  it('leaves everything untouched when it refuses', async () => {
    const settings = new InMemorySettingsRepository(anchorFive);
    const cycles = new InMemoryCycleRepository([
      augustWith('2026-08-06', '2026-08-20'),
    ]);
    const useCase = new ConfigurePaydayAnchor(
      settings,
      cycles,
      noHolidays,
      clock,
    );

    await expect(
      useCase.change({ anchorDay: 10, shiftPolicy: ShiftPolicy.Preceding }),
    ).rejects.toThrow();

    expect((await settings.load()).dayOfMonth).toBe(5);
    expect(cycles.saved[0]?.ref.start.toISO()).toBe('2026-08-05');
  });

  /**
   * The first run has to show what an anchor day *means* before anyone commits
   * to it, and cycle resolution lives in CycleRef and nowhere else — so the
   * boundaries are resolved here rather than recomputed in the frontend.
   */
  describe('resolveWindow', () => {
    const useCase = () =>
      new ConfigurePaydayAnchor(
        new InMemorySettingsRepository(anchorFive),
        new InMemoryCycleRepository(),
        noHolidays,
        clock,
      );

    /**
     * Opens on the cycle containing today — 10 Aug 2026 with pay on the 5th is
     * already the September cycle, because a cycle is named for the month it
     * is spent in and so opens on the previous month's payday.
     */
    it('resolves the coming cycles for an anchor nobody has saved', async () => {
      const window = await useCase().resolveWindow(
        { anchorDay: 5, shiftPolicy: ShiftPolicy.Preceding },
        2,
      );

      expect(window).toEqual([
        {
          month: '2026-09',
          label: 'Setembro de 2026',
          start: '2026-08-05',
          end: '2026-09-03',
          shifted: false,
          clamped: false,
        },
        // 5 Sep 2026 is a Saturday, so October opens on Friday the 4th.
        {
          month: '2026-10',
          label: 'Outubro de 2026',
          start: '2026-09-04',
          end: '2026-10-04',
          shifted: true,
          clamped: false,
        },
      ]);
    });

    it('leaves the stored anchor alone', async () => {
      const settings = new InMemorySettingsRepository(anchorFive);
      const configure = new ConfigurePaydayAnchor(
        settings,
        new InMemoryCycleRepository(),
        noHolidays,
        clock,
      );

      await configure.resolveWindow(
        { anchorDay: 20, shiftPolicy: ShiftPolicy.Following },
        1,
      );

      expect((await settings.load()).dayOfMonth).toBe(5);
      expect(await settings.isConfigured()).toBe(false);
    });

    /**
     * Day 31 clamps onto each month's length, which is how a last-day-of-month
     * payday is expressed — day 30 would miss the 31st of the long months. The
     * cycle opening in February is where that becomes visible.
     */
    it('reports the months where the anchor day ran past the month end', async () => {
      const window = await useCase().resolveWindow(
        { anchorDay: 31, shiftPolicy: ShiftPolicy.Preceding },
        12,
      );

      expect(window.find((cycle) => cycle.month === '2027-03')).toMatchObject({
        start: '2027-02-26',
        clamped: true,
      });
      expect(window.find((cycle) => cycle.month === '2026-09')).toMatchObject({
        start: '2026-08-31',
        clamped: false,
      });
    });
  });

  it('rejects an anchor day that is not a day of the month', async () => {
    const useCase = new ConfigurePaydayAnchor(
      new InMemorySettingsRepository(anchorFive),
      new InMemoryCycleRepository(),
      noHolidays,
      clock,
    );

    await expect(
      useCase.change({ anchorDay: 0, shiftPolicy: ShiftPolicy.Preceding }),
    ).rejects.toThrow();
  });
});
