import { CycleRef } from '../../domain/budgeting/cycle-ref.js';
import type { Cycle } from '../../domain/budgeting/cycle.js';
import { EntryNotFound } from '../../domain/budgeting/cycle.js';
import type { EntryKind } from '../../domain/budgeting/ledger-entry.js';
import { LedgerEntry } from '../../domain/budgeting/ledger-entry.js';
import type { HolidayCalendar } from '../../domain/ports/holiday-calendar.js';
import type {
  CycleRepository,
  SettingsRepository,
} from '../../domain/ports/repositories.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import { LocalDate } from '../../domain/shared/local-date.js';
import { Money } from '../../domain/shared/money.js';
import type { SettlementStatus } from '../../domain/shared/planned-actual.js';

export class CycleNotFound extends DomainError {}

/**
 * UC-3.4, UC-3.5, UC-3.7 — the writes that make the ledger usable.
 *
 * Settling is the most repeated action in the app, so it takes the least
 * possible input: an actual amount only when it differs from the plan.
 */
export class LedgerActions {
  constructor(
    private readonly cycles: CycleRepository,
    private readonly settings: SettingsRepository,
    private readonly holidays: HolidayCalendar,
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  /**
   * Turns a plan into a fact. Omitting the actual amount settles at the
   * planned one, which is the common case and what makes this one click.
   */
  async settle(input: {
    month: string;
    entryId: string;
    status: SettlementStatus;
    actualCents?: number;
  }): Promise<void> {
    await this.mutate(input.month, (cycle) => {
      const entry = entryOrThrow(cycle, input.entryId);
      const actual =
        input.actualCents === undefined
          ? entry.amount.planned
          : Money.fromCents(input.actualCents);

      return cycle.settleEntry(input.entryId, actual, input.status);
    });
  }

  async skip(month: string, entryId: string): Promise<void> {
    await this.mutate(month, (cycle) => cycle.skipEntry(entryId));
  }

  /** A one-off in or out that no template covers. */
  async addEntry(input: {
    month: string;
    description: string;
    kind: EntryKind;
    dueDate: string;
    amountCents: number;
    isEstimate?: boolean;
  }): Promise<string> {
    const id = this.newId();

    await this.mutate(input.month, (cycle) =>
      cycle.addEntry(
        LedgerEntry.create({
          id,
          description: input.description,
          kind: input.kind,
          dueDate: LocalDate.parse(input.dueDate),
          planned: Money.fromCents(input.amountCents),
          ...(input.isEstimate === undefined
            ? {}
            : { isEstimate: input.isEstimate }),
        }),
      ),
    );

    return id;
  }

  /** Changes one cycle's figure without touching whatever generated it. */
  async override(
    month: string,
    entryId: string,
    amountCents: number,
  ): Promise<void> {
    await this.mutate(month, (cycle) =>
      cycle.overrideEntry(entryId, Money.fromCents(amountCents)),
    );
  }

  async revertOverride(month: string, entryId: string): Promise<void> {
    await this.mutate(month, (cycle) => cycle.revertEntryOverride(entryId));
  }

  private async mutate(
    month: string,
    change: (cycle: Cycle) => Cycle,
  ): Promise<void> {
    const anchor = await this.settings.load();
    const ref = CycleRef.forMonth(month, anchor, this.holidays);
    const cycle = await this.cycles.findByMonth(ref);

    if (cycle === undefined) {
      throw new CycleNotFound(
        `O ciclo de ${ref.label} ainda não tem nada dentro; abra-o primeiro para materializá-lo.`,
      );
    }

    await this.cycles.save(change(cycle));
  }
}

function entryOrThrow(cycle: Cycle, entryId: string): LedgerEntry {
  const entry = cycle.entries.find((candidate) => candidate.id === entryId);
  if (entry === undefined) {
    throw new EntryNotFound(
      `Não há nenhum lançamento ${entryId} no ciclo de ${cycle.ref.label}.`,
    );
  }
  return entry;
}
