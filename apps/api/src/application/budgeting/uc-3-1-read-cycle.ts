import { CycleRef } from '../../domain/budgeting/cycle-ref.js';
import type { CalculationChain } from '../../domain/budgeting/cycle.js';
import { Cycle, Estimates } from '../../domain/budgeting/cycle.js';
import type { LedgerEntry } from '../../domain/budgeting/ledger-entry.js';
import type { HolidayCalendar } from '../../domain/ports/holiday-calendar.js';
import type {
  BucketRepository,
  CycleRepository,
  RecurringTemplateRepository,
  SettingsRepository,
} from '../../domain/ports/repositories.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import { allocateInto } from '../../domain/budgeting/allocation-generation.js';
import { generateInto } from '../../domain/budgeting/template-generation.js';
import type { OpeningBalanceSource } from './uc-3-3-list-cycles.js';

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
    private readonly buckets: BucketRepository,
    private readonly openings: OpeningBalanceSource,
  ) {}

  async byMonth(
    month: string,
    estimates: Estimates = Estimates.Included,
  ): Promise<CycleView> {
    const ref = await this.refFor(month);
    // One definition of what a cycle opens on: until something closes there
    // is no stored closing balance to carry in, and the stored zero is not an
    // answer — it is the absence of one.
    const opening = await this.openings.openingBalanceOf(month);
    const found = await this.cycles.findByMonth(ref);
    const stored =
      found === undefined
        ? Cycle.open({ id: month, ref, openingBalance: opening })
        : found.withOpeningBalance(opening);

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

    // Derived on top of what was persisted, never saved: a rule is a
    // statement about every cycle it applies to, so it has to be re-read
    // rather than frozen into a row that a rule change would leave stale.
    const allocated = allocateInto(
      generated.cycle,
      await this.buckets.findAll(),
    );

    return toView(allocated, estimates);
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
  };
}

/** Stable and derived, so regenerating the same cycle reuses the same row. */
export function entryId(templateId: string, month: string): string {
  return `${templateId}@${month}`;
}
