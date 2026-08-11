import { CycleRef, PaydayAnchor } from '../../domain/budgeting/cycle-ref.js';
import type { LedgerEntry } from '../../domain/budgeting/ledger-entry.js';
import { Cycle } from '../../domain/budgeting/cycle.js';
import type { Clock } from '../../domain/ports/clock.js';
import type { HolidayCalendar } from '../../domain/ports/holiday-calendar.js';
import type {
  CycleRepository,
  SettingsRepository,
} from '../../domain/ports/repositories.js';
import { LocalDate } from '../../domain/shared/local-date.js';

export interface AnchorSettings {
  readonly anchorDay: number;
  readonly shiftPolicy: PaydayAnchor['shiftPolicy'];
}

/** One open cycle's boundaries before and after a proposed anchor change. */
export interface CycleShift {
  readonly month: string;
  readonly currentRange: string;
  readonly proposedRange: string;
  /** Entries that would no longer fall inside their own cycle. */
  readonly entriesLeaving: number;
}

export interface AnchorChangePreview {
  readonly current: AnchorSettings;
  readonly proposed: AnchorSettings;
  /** Only open cycles: a closed cycle is never re-sliced. */
  readonly shifts: readonly CycleShift[];
  readonly totalEntriesMoving: number;
  /**
   * Entries that would fall outside every open cycle in the window — they
   * cannot be re-homed automatically and would need moving by hand.
   */
  readonly orphanedEntries: number;
}

export class AnchorChangeWouldOrphanEntries extends Error {
  constructor(readonly orphanedEntries: number) {
    super(
      `Changing the anchor would leave ${String(orphanedEntries)} entr${orphanedEntries === 1 ? 'y' : 'ies'} outside every open cycle. Move or settle them first.`,
    );
    this.name = 'AnchorChangeWouldOrphanEntries';
  }
}

/** How many cycles ahead the app keeps, and therefore re-slices. */
const WINDOW = 12;

/**
 * UC-1.1 — read the payday anchor, preview what changing it would do, and
 * apply it.
 *
 * Changing the anchor re-slices every open cycle, so it can never be a silent
 * write: the preview is computed without persisting anything, and closed
 * cycles are left exactly as they are.
 */
export class ConfigurePaydayAnchor {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly cycles: CycleRepository,
    private readonly holidays: HolidayCalendar,
    private readonly clock: Clock,
  ) {}

  async read(): Promise<AnchorSettings> {
    const anchor = await this.settings.load();

    return {
      anchorDay: anchor.dayOfMonth,
      shiftPolicy: anchor.shiftPolicy,
    };
  }

  async preview(proposed: AnchorSettings): Promise<AnchorChangePreview> {
    const current = await this.settings.load();
    const next = PaydayAnchor.of(proposed.anchorDay, proposed.shiftPolicy);
    const open = await this.openCyclesFrom(current);

    const shifts = open.map(({ cycle, ref }) => {
      const proposedRef = CycleRef.forMonth(ref.month, next, this.holidays);
      const leaving = cycle.entries.filter(
        (entry) => !proposedRef.contains(entry.dueDate),
      );

      return {
        month: ref.month,
        currentRange: ref.range.toString(),
        proposedRange: proposedRef.range.toString(),
        entriesLeaving: leaving.length,
      };
    });

    const proposedRefs = open.map(({ ref }) =>
      CycleRef.forMonth(ref.month, next, this.holidays),
    );
    const orphaned = open
      .flatMap(({ cycle }) => cycle.entries)
      .filter((entry) => findHome(proposedRefs, entry) === undefined);

    return {
      current: {
        anchorDay: current.dayOfMonth,
        shiftPolicy: current.shiftPolicy,
      },
      proposed,
      shifts: shifts.filter((shift) => shift.entriesLeaving > 0),
      totalEntriesMoving: shifts.reduce(
        (total, shift) => total + shift.entriesLeaving,
        0,
      ),
      orphanedEntries: orphaned.length,
    };
  }

  /**
   * Applies the new anchor and re-homes the entries of every open cycle.
   *
   * Refuses outright when an entry would land outside every open cycle. The
   * preview reports that case, and applying anyway would either drop the entry
   * or leave it in a cycle whose range no longer contains it.
   */
  async change(proposed: AnchorSettings): Promise<AnchorChangePreview> {
    const summary = await this.preview(proposed);
    if (summary.orphanedEntries > 0) {
      throw new AnchorChangeWouldOrphanEntries(summary.orphanedEntries);
    }
    const current = await this.settings.load();
    const next = PaydayAnchor.of(proposed.anchorDay, proposed.shiftPolicy);
    const open = await this.openCyclesFrom(current);

    const rehomed = open.map(({ cycle, ref }) => ({
      ref: CycleRef.forMonth(ref.month, next, this.holidays),
      openingBalance: cycle.openingBalance,
      id: cycle.id,
      entries: [] as LedgerEntry[],
    }));

    for (const { cycle } of open) {
      for (const entry of cycle.entries) {
        const home = rehomed.find((candidate) =>
          candidate.ref.contains(entry.dueDate),
        );

        home?.entries.push(entry);
      }
    }

    await this.settings.save(next);
    for (const slice of rehomed) {
      await this.cycles.save(
        Cycle.open({
          id: slice.id,
          ref: slice.ref,
          openingBalance: slice.openingBalance,
          entries: slice.entries,
        }),
      );
    }

    return summary;
  }

  /** The open cycles in the rolling window, oldest first. */
  private async openCyclesFrom(
    anchor: PaydayAnchor,
  ): Promise<{ cycle: Cycle; ref: CycleRef }[]> {
    const today = LocalDate.fromInstant(this.clock.now());
    const refs = CycleRef.rolling(
      monthOf(today),
      WINDOW,
      anchor,
      this.holidays,
    );

    const found = await Promise.all(
      refs.map(async (ref) => ({
        ref,
        cycle: await this.cycles.findByMonth(ref),
      })),
    );

    return found
      .filter(
        (candidate): candidate is { ref: CycleRef; cycle: Cycle } =>
          candidate.cycle !== undefined,
      )
      .filter(({ cycle }) => !cycle.isClosed);
  }
}

function findHome(
  refs: readonly CycleRef[],
  entry: LedgerEntry,
): CycleRef | undefined {
  return refs.find((ref) => ref.contains(entry.dueDate));
}

function monthOf(date: LocalDate): string {
  return `${String(date.year)}-${String(date.month).padStart(2, '0')}`;
}
