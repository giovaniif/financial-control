import { CycleRef } from '../../domain/budgeting/cycle-ref.js';
import type { CalculationChain } from '../../domain/budgeting/cycle.js';
import { Cycle, Estimates } from '../../domain/budgeting/cycle.js';
import type { LedgerEntry } from '../../domain/budgeting/ledger-entry.js';
import type { HolidayCalendar } from '../../domain/ports/holiday-calendar.js';
import type {
  CycleRepository,
  RecurringTemplateRepository,
  SettingsRepository,
} from '../../domain/ports/repositories.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import type { LocalDate } from '../../domain/shared/local-date.js';
import { Money } from '../../domain/shared/money.js';
import { generateInto } from '../../domain/budgeting/template-generation.js';

export class UnknownMonth extends DomainError {}

export interface EntryRowView {
  readonly id: string;
  readonly description: string;
  readonly kind: LedgerEntry['kind'];
  readonly dueDate: string;
  readonly plannedCents: number;
  readonly actualCents: number | undefined;
  readonly status: LedgerEntry['status'];
  readonly isEstimate: boolean;
  readonly isOverridden: boolean;
  readonly varianceCents: number | undefined;
  readonly balanceCents: number;
}

export interface CycleView {
  readonly id: string;
  readonly month: string;
  readonly label: string;
  readonly start: string;
  readonly end: string;
  readonly status: Cycle['status'];
  readonly estimates: Estimates;
  readonly chain: CalculationChain;
  readonly entries: readonly EntryRowView[];
  readonly lowWaterMark:
    { balanceCents: number; date: string; description: string } | undefined;
  readonly firstNegativeDate: string | undefined;
}

/**
 * UC-3.1 / UC-3.2 — one cycle in full: the calculation chain, every entry in
 * due-date order with the balance standing after it, and where the cash dips.
 *
 * A month that has never been materialised reads as an empty cycle rather than
 * a 404: it exists, nothing has been put in it yet.
 */
export class ReadCycle {
  constructor(
    private readonly cycles: CycleRepository,
    private readonly settings: SettingsRepository,
    private readonly holidays: HolidayCalendar,
    private readonly templates: RecurringTemplateRepository,
  ) {}

  async byMonth(
    month: string,
    estimates: Estimates = Estimates.Included,
  ): Promise<CycleView> {
    const ref = await this.refFor(month);
    const stored =
      (await this.cycles.findByMonth(ref)) ??
      Cycle.open({ id: month, ref, openingBalance: Money.zero() });

    // Materialised on read: a cycle nobody has opened yet is still made of the
    // templates that apply to it. Generation is idempotent, so this is safe to
    // repeat, and the result is persisted only when it actually added
    // something — a plain read must not write.
    const generated = generateInto(
      stored,
      await this.templates.findAll(),
      entryId,
    );
    if (generated.added.length > 0) {
      await this.cycles.save(generated.cycle);
    }

    return toView(generated.cycle, estimates);
  }

  /** Resolves a month against the configured anchor. */
  async refFor(month: string): Promise<CycleRef> {
    const anchor = await this.settings.load();
    try {
      return CycleRef.forMonth(month, anchor, this.holidays);
    } catch {
      throw new UnknownMonth(`Não é um mês no formato YYYY-MM: "${month}".`);
    }
  }
}

export function toView(cycle: Cycle, estimates: Estimates): CycleView {
  const rows = cycle.runningBalance(estimates);
  const low = cycle.lowWaterMark(estimates);

  return {
    id: cycle.id,
    month: cycle.ref.month,
    label: cycle.ref.label,
    start: cycle.ref.start.toISO(),
    end: cycle.ref.end.toISO(),
    status: cycle.status,
    estimates,
    chain: cycle.chain(estimates),
    entries: rows.map(({ entry, balance }) => ({
      id: entry.id,
      description: entry.description,
      kind: entry.kind,
      dueDate: entry.dueDate.toISO(),
      plannedCents: entry.amount.planned.cents,
      actualCents: entry.amount.actual?.cents,
      status: entry.status,
      isEstimate: entry.isEstimate,
      isOverridden: entry.isOverridden,
      varianceCents: entry.amount.variance?.cents,
      balanceCents: balance.cents,
    })),
    lowWaterMark:
      low === undefined
        ? undefined
        : {
            balanceCents: low.balance.cents,
            date: low.date.toISO(),
            description: low.entry.description,
          },
    firstNegativeDate: isoOrUndefined(cycle.firstNegativeDate(estimates)),
  };
}

/** Stable and derived, so regenerating the same cycle reuses the same row. */
export function entryId(templateId: string, month: string): string {
  return `${templateId}@${month}`;
}

function isoOrUndefined(date: LocalDate | undefined): string | undefined {
  return date?.toISO();
}
