import { allocateInto } from '../../domain/budgeting/allocation-generation.js';
import { CycleRef } from '../../domain/budgeting/cycle-ref.js';
import type { Cycle } from '../../domain/budgeting/cycle.js';
import { Estimates } from '../../domain/budgeting/cycle.js';
import type { Clock } from '../../domain/ports/clock.js';
import type { HolidayCalendar } from '../../domain/ports/holiday-calendar.js';
import type {
  BucketRepository,
  CycleRepository,
  SettingsRepository,
} from '../../domain/ports/repositories.js';
import { LocalDate } from '../../domain/shared/local-date.js';
import { Money } from '../../domain/shared/money.js';
import { monthOf } from '../budgeting/month.js';
import type { OpeningBalanceSource } from '../budgeting/uc-3-3-list-cycles.js';

/** The one-sentence answer, and the three numbers that qualify it. */
export interface HeadlineView {
  readonly cycleMonth: string;
  readonly cycleLabel: string;
  readonly range: string;
  readonly incomingCents: number;
  readonly outgoingCents: number;
  readonly freeCents: number;
  readonly closingCents: number;
  /** The same closing balance with the unconfirmed placeholders left out. */
  readonly closingWithoutEstimatesCents: number;
}

export interface UpcomingEntryView {
  readonly id: string;
  readonly cycleMonth: string;
  readonly description: string;
  readonly dueDate: string;
  readonly amountCents: number;
  readonly isEstimate: boolean;
  readonly isOverdue: boolean;
  readonly daysLate: number;
  /** UC-3.7 — this cycle's figure was changed on its own. */
  readonly isOverridden: boolean;
  /** What reverting would put back, and null when there is nothing to revert. */
  readonly projectedAmountCents: number | null;
}

export interface DashboardView {
  readonly today: string;
  readonly currentCycleMonth: string;
  /**
   * Which reading every figure below was taken in. The global toggle that
   * first asked for this is gone (UC-4.4), but both readings remain so the
   * assistant can be asked for either (UC-8.2).
   */
  readonly estimates: Estimates;
  readonly headline: HeadlineView;
  /**
   * How the chosen cycle came out against its plan — UC-3.6. `null` for a
   * projected cycle, which has no facts to compare a plan against; zero is
   * the different answer that everything settled went to plan.
   */
  readonly varianceCents: number | null;
  readonly upcoming: readonly UpcomingEntryView[];
}

/**
 * The window opens one cycle *behind* the current one, so `current` is always
 * the second entry: reading it from a fixed index spares every caller from
 * working out whether today falls before or after this month's payday.
 */
const LOOK_BACK = 1;
const HORIZON = 4;
/**
 * A guard on the payload, not a decision about what the user sees.
 *
 * The worklist is bounded by the cycles it covers — the current one, the next
 * and the one after — which is a bound that answers "what should I act on".
 * A row count answers nothing, and this list is the only place an entry is
 * settled by hand (UC-4.5), so one it drops cannot be settled at all.
 *
 * Three cycles of a heavy month come nowhere near this.
 */
const UPCOMING_CEILING = 500;

/**
 * UC-4 — the screen that answers "how much will I pay next cycle, and how
 * much is left on the 5th".
 *
 * Read-only: every figure is derived from the cycles and settings
 * that already exist, so the dashboard can never drift from the ledger.
 */
export class BuildDashboard {
  constructor(
    private readonly cycles: CycleRepository,
    private readonly settings: SettingsRepository,
    private readonly holidays: HolidayCalendar,
    private readonly clock: Clock,
    private readonly buckets: BucketRepository,
    private readonly openings: OpeningBalanceSource,
  ) {}

  /**
   * `month` chooses which cycle the screen describes (UC-3.3). Left out, it is
   * the cycle after the current one: the Dashboard opens on the cycle you are
   * in but speaks about the next, because that is when the question is asked.
   *
   * The worklist stays anchored to today either way. It is a thing to act
   * on, not a view of the chosen cycle, and looking back at a settled cycle
   * must not hide what is overdue now.
   *
   * `estimates` is the global toggle of UC-4.4, and it reaches every figure
   * here — the chain already computes both readings, so there is no second
   * code path and nothing for a client to reconcile.
   */
  async build(
    month?: string,
    estimates: Estimates = Estimates.Included,
  ): Promise<DashboardView> {
    const today = LocalDate.fromInstant(this.clock.now());
    const anchor = await this.settings.load();
    const current = CycleRef.forMonth(
      monthOf(today, anchor, this.holidays),
      anchor,
      this.holidays,
    );
    const window = CycleRef.rolling(
      current.previous().month,
      HORIZON,
      anchor,
      this.holidays,
    );

    const [, currentRef, nextRef] = window;
    if (currentRef === undefined || nextRef === undefined) {
      throw new Error('A janela móvel sempre tem pelo menos três ciclos.');
    }

    const chosenRef =
      month === undefined
        ? nextRef
        : CycleRef.forMonth(month, anchor, this.holidays);

    // The same derivation the cycle route and the rolling window apply, so
    // the three cannot report different figures for one cycle.
    const buckets = await this.buckets.findAll();
    const withAllocations = (cycle: Cycle | undefined) =>
      cycle === undefined ? undefined : allocateInto(cycle, buckets);

    const opened = async (ref: CycleRef) => {
      const found = await this.cycles.findByMonth(ref);
      return found?.withOpeningBalance(
        await this.openings.openingBalanceOf(ref.month),
      );
    };

    const chosen = withAllocations(await opened(chosenRef));

    return {
      today: today.toISO(),
      // Reported alongside the chosen cycle so the UI can still say which one
      // is current, however far the user has navigated from it.
      currentCycleMonth: currentRef.month,
      estimates,
      headline: headlineOf(chosenRef, chosen, estimates),
      varianceCents: varianceOf(chosenRef, currentRef, chosen),
      upcoming: await this.upcomingFrom(
        chosenRef,
        window.slice(LOOK_BACK),
        today,
        estimates,
      ),
    };
  }

  /**
   * The worklist for the cycle on screen.
   *
   * Everything else on Main describes the selected cycle, so this does too —
   * three cycles of the same recurring bills read as a repetition rather than
   * as a list of work.
   *
   * **Overdue entries survive the selection.** They are the one thing here
   * that is about today rather than about a cycle, and Main opens on the
   * *next* one — so scoping them away would hide a late bill behind cycle
   * navigation, on the only screen that can settle it (UC-4.5).
   */
  private async upcomingFrom(
    chosen: CycleRef,
    window: readonly CycleRef[],
    today: LocalDate,
    estimates: Estimates,
  ): Promise<UpcomingEntryView[]> {
    const rows: UpcomingEntryView[] = [];

    for (const ref of window) {
      const cycle = await this.cycles.findByMonth(ref);
      if (cycle === undefined) {
        continue;
      }

      for (const entry of cycle.entries) {
        // The worklist counts the same entries the chain does, so a figure
        // and the list it is made of can never disagree.
        if (
          entry.isSettled ||
          (entry.isEstimate && estimates === Estimates.Excluded)
        ) {
          continue;
        }
        const daysLate = entry.dueDate.daysUntil(today);
        const isOverdue = daysLate > 0;
        if (ref.month !== chosen.month && !isOverdue) {
          continue;
        }
        rows.push({
          id: entry.id,
          cycleMonth: ref.month,
          description: entry.description,
          dueDate: entry.dueDate.toISO(),
          amountCents: entry.amount.planned.cents,
          isEstimate: entry.isEstimate,
          isOverdue,
          daysLate: Math.max(0, daysLate),
          isOverridden: entry.isOverridden,
          projectedAmountCents: entry.projectedAmount?.cents ?? null,
        });
      }
    }

    // Overdue first, then by date: the fastest path to settling something.
    return rows
      .sort((a, b) =>
        a.isOverdue === b.isOverdue
          ? a.dueDate.localeCompare(b.dueDate)
          : Number(b.isOverdue) - Number(a.isOverdue),
      )
      .slice(0, UPCOMING_CEILING);
  }
}

function headlineOf(
  ref: CycleRef,
  cycle: Cycle | undefined,
  estimates: Estimates,
): HeadlineView {
  const chain = cycle?.chain(estimates);

  return {
    cycleMonth: ref.month,
    cycleLabel: ref.label,
    range: ref.range.toString(),
    incomingCents: chain?.totalIncome.cents ?? 0,
    outgoingCents: chain?.totalOutcome.cents ?? 0,
    freeCents: chain?.netSurplus.cents ?? 0,
    closingCents: chain?.closingBalance.cents ?? 0,
    closingWithoutEstimatesCents:
      cycle?.closingBalance(Estimates.Excluded).cents ?? 0,
  };
}

/**
 * What the settled entries actually did against what they were planned to do.
 *
 * The sign is uniform in both directions because `variance` is
 * `realised − planned`: a bill that cost more and a salary that arrived short
 * are both negative, and a skipped bill is positive by its whole amount
 * because a skipped entry realises nothing.
 *
 * The estimate flag is deliberately not consulted. `~estimate` marks a figure
 * nobody has confirmed, and settling one confirms it — excluding it here
 * would drop money that really moved.
 */
function varianceOf(
  chosen: CycleRef,
  current: CycleRef,
  cycle: Cycle | undefined,
): number | null {
  // Months are `YYYY-MM`, so they order lexically.
  if (chosen.month > current.month) {
    return null;
  }

  return Money.sum(
    (cycle?.entries ?? [])
      .map((entry) => entry.amount.variance)
      .filter((variance) => variance !== undefined),
  ).cents;
}
