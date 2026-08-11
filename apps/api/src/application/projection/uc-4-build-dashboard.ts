import { CycleRef } from '../../domain/budgeting/cycle-ref.js';
import type { Cycle } from '../../domain/budgeting/cycle.js';
import { Estimates } from '../../domain/budgeting/cycle.js';
import type { LedgerEntry } from '../../domain/budgeting/ledger-entry.js';
import type { Bucket } from '../../domain/goals/bucket.js';
import { BucketStatus } from '../../domain/goals/bucket.js';
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

/** The one-sentence answer, and the three numbers that qualify it. */
export interface HeadlineView {
  readonly cycleMonth: string;
  readonly cycleLabel: string;
  readonly range: string;
  readonly incomingCents: number;
  readonly outgoingCents: number;
  readonly freeCents: number;
  readonly lowestPointCents: number | undefined;
  readonly lowestPointDate: string | undefined;
  readonly closingCents: number;
  /** The same closing balance with the unconfirmed placeholders left out. */
  readonly closingWithoutEstimatesCents: number;
}

export interface KpiView {
  readonly label: string;
  readonly amountCents: number;
  readonly note: string;
}

/** How far through the cycle today is, against how much has gone out. */
export interface CycleProgressView {
  readonly dayOfCycle: number;
  readonly cycleLength: number;
  readonly timePercent: number;
  readonly spentCents: number;
  readonly plannedOutCents: number;
  readonly spentPercent: number;
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
}

export const AlertSeverity = {
  Critical: 'CRITICAL',
  Warning: 'WARNING',
  Info: 'INFO',
} as const;

export type AlertSeverity = (typeof AlertSeverity)[keyof typeof AlertSeverity];

export interface AlertView {
  readonly severity: AlertSeverity;
  readonly title: string;
  readonly body: string;
}

export interface DashboardView {
  readonly today: string;
  readonly currentCycleMonth: string;
  readonly headline: HeadlineView;
  readonly kpis: readonly KpiView[];
  readonly progress: CycleProgressView;
  readonly upcoming: readonly UpcomingEntryView[];
  readonly alerts: readonly AlertView[];
}

/**
 * The window the alerts scan. It opens one cycle *behind* the current one so
 * the "past cycle still unsettled" alert can fire at all — that is the top
 * alert in UC-4.7, and a window starting at today would never reach a cycle
 * old enough to raise it.
 */
const LOOK_BACK = 1;
const HORIZON = 4;
const UPCOMING_LIMIT = 8;

/**
 * UC-4 — the screen that answers "how much will I pay next cycle, and how
 * much is left on the 5th".
 *
 * Read-only: every figure is derived from the cycles, buckets and settings
 * that already exist, so the dashboard can never drift from the ledger.
 */
export class BuildDashboard {
  constructor(
    private readonly cycles: CycleRepository,
    private readonly buckets: BucketRepository,
    private readonly settings: SettingsRepository,
    private readonly holidays: HolidayCalendar,
    private readonly clock: Clock,
  ) {}

  async build(): Promise<DashboardView> {
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
      throw new Error('The rolling window always holds at least three cycles.');
    }

    const currentCycle = await this.cycles.findByMonth(currentRef);
    const next = await this.cycles.findByMonth(nextRef);
    const buckets = await this.buckets.findAll();

    return {
      today: today.toISO(),
      currentCycleMonth: currentRef.month,
      // The Dashboard opens on the current cycle but speaks about the next:
      // the question is always asked from the middle of the one you are in.
      headline: headlineOf(nextRef, next),
      kpis: kpisOf(next),
      progress: progressOf(currentRef, currentCycle, today),
      upcoming: await this.upcomingFrom(window.slice(LOOK_BACK), today),
      alerts: await this.alertsFrom(window, buckets, today),
    };
  }

  private async upcomingFrom(
    window: readonly CycleRef[],
    today: LocalDate,
  ): Promise<UpcomingEntryView[]> {
    const rows: UpcomingEntryView[] = [];

    for (const ref of window) {
      const cycle = await this.cycles.findByMonth(ref);
      if (cycle === undefined) {
        continue;
      }

      for (const entry of cycle.entries) {
        if (entry.isSettled) {
          continue;
        }
        const daysLate = entry.dueDate.daysUntil(today);
        rows.push({
          id: entry.id,
          cycleMonth: ref.month,
          description: entry.description,
          dueDate: entry.dueDate.toISO(),
          amountCents: entry.amount.planned.cents,
          isEstimate: entry.isEstimate,
          isOverdue: daysLate > 0,
          daysLate: Math.max(0, daysLate),
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
      .slice(0, UPCOMING_LIMIT);
  }

  private async alertsFrom(
    window: readonly CycleRef[],
    buckets: readonly Bucket[],
    today: LocalDate,
  ): Promise<AlertView[]> {
    const alerts: AlertView[] = [];

    for (const ref of window) {
      const cycle = await this.cycles.findByMonth(ref);
      if (cycle === undefined) {
        continue;
      }

      // A past cycle with an unsettled entry cannot be closed.
      if (ref.end.isBefore(today)) {
        const unsettled = cycle.unsettledEntries;
        if (unsettled.length > 0) {
          alerts.push({
            severity: AlertSeverity.Critical,
            title: `${ref.label} has ${String(unsettled.length)} unsettled entr${unsettled.length === 1 ? 'y' : 'ies'}`,
            body: `${describe(unsettled)} — the cycle cannot be closed until each is settled or skipped.`,
          });
        }
      }

      const negativeOn = cycle.firstNegativeDate();
      if (negativeOn !== undefined) {
        const culprit = cycle
          .runningBalance()
          .find((row) => row.balance.isNegative());
        alerts.push({
          severity: AlertSeverity.Critical,
          title: `Projected negative balance on ${negativeOn.toISO()}`,
          body: `${ref.label} runs to ${culprit?.balance.toReais() ?? '—'} after ${culprit?.entry.description ?? 'that entry'}.`,
        });
      }

      const withEstimates = cycle.closingBalance(Estimates.Included);
      const confirmed = cycle.closingBalance(Estimates.Excluded);
      if (!withEstimates.equals(confirmed)) {
        alerts.push({
          severity: AlertSeverity.Warning,
          title: `${ref.label} still rests on an unconfirmed estimate`,
          body: `It closes at ${withEstimates.toReais()} with the estimate, ${confirmed.toReais()} without.`,
        });
      }
    }

    for (const bucket of buckets) {
      if (
        bucket.status !== BucketStatus.Active ||
        bucket.target === undefined
      ) {
        continue;
      }
      // Behind means the target date has passed with the goal unmet.
      if (bucket.target.date.isBefore(today) && !bucket.isComplete) {
        alerts.push({
          severity: AlertSeverity.Warning,
          title: `${bucket.name} is behind its target date`,
          body: `It holds ${bucket.balance.toReais()} of ${bucket.target.amount.toReais()}, and the target date ${bucket.target.date.toISO()} has passed.`,
        });
      }
    }

    return alerts.sort(
      (a, b) => severityRank(a.severity) - severityRank(b.severity),
    );
  }
}

function headlineOf(ref: CycleRef, cycle: Cycle | undefined): HeadlineView {
  const chain = cycle?.chain(Estimates.Included);
  const low = cycle?.lowWaterMark();

  return {
    cycleMonth: ref.month,
    cycleLabel: ref.label,
    range: ref.range.toString(),
    incomingCents: chain?.totalIncome.cents ?? 0,
    outgoingCents: chain?.totalOutcome.cents ?? 0,
    freeCents: chain?.netSurplus.cents ?? 0,
    lowestPointCents: low?.balance.cents,
    lowestPointDate: low?.date.toISO(),
    closingCents: chain?.closingBalance.cents ?? 0,
    closingWithoutEstimatesCents:
      cycle?.closingBalance(Estimates.Excluded).cents ?? 0,
  };
}

function kpisOf(cycle: Cycle | undefined): KpiView[] {
  const chain = cycle?.chain(Estimates.Included);
  const low = cycle?.lowWaterMark();

  return [
    {
      label: 'Total Outcome',
      amountCents: chain?.totalOutcome.cents ?? 0,
      note: 'everything leaving the account',
    },
    {
      label: 'Expected Surplus',
      amountCents: chain?.expectedSurplus.cents ?? 0,
      note: 'available to allocate',
    },
    {
      label: 'Net Surplus',
      amountCents: chain?.netSurplus.cents ?? 0,
      note: 'free cash after allocations',
    },
    {
      label: 'Lowest point in cycle',
      amountCents: low?.balance.cents ?? 0,
      note:
        low === undefined
          ? 'nothing scheduled yet'
          : `on ${low.date.toISO()}, after ${low.entry.description}`,
    },
  ];
}

function progressOf(
  ref: CycleRef,
  cycle: Cycle | undefined,
  today: LocalDate,
): CycleProgressView {
  const length = ref.range.days;
  const dayOfCycle = Math.min(
    length,
    Math.max(1, ref.start.daysUntil(today) + 1),
  );

  const planned = cycle?.chain(Estimates.Included).totalOutcome ?? Money.zero();
  const spent = Money.sum(
    (cycle?.entries ?? [])
      .filter((entry) => entry.isSettled && entry.realised.isNegative())
      .map((entry) => entry.realised),
  ).abs();

  return {
    dayOfCycle,
    cycleLength: length,
    timePercent: Math.round((dayOfCycle / length) * 100),
    spentCents: spent.cents,
    plannedOutCents: planned.cents,
    spentPercent: planned.isZero()
      ? 0
      : Math.round((spent.cents / planned.cents) * 100),
  };
}

function describe(entries: readonly LedgerEntry[]): string {
  const names = entries.slice(0, 3).map((entry) => entry.description);

  return entries.length > 3
    ? `${names.join(', ')} and ${String(entries.length - 3)} more`
    : names.join(', ');
}

function severityRank(severity: AlertSeverity): number {
  return { CRITICAL: 0, WARNING: 1, INFO: 2 }[severity];
}
