import { CycleRef } from '../../domain/budgeting/cycle-ref.js';
import type { PaydayAnchor } from '../../domain/budgeting/cycle-ref.js';
import type { LedgerEntry } from '../../domain/budgeting/ledger-entry.js';
import type {
  Direction,
  TemplateStatus,
} from '../../domain/budgeting/recurring-template.js';
import { RecurringTemplate } from '../../domain/budgeting/recurring-template.js';
import type { Clock } from '../../domain/ports/clock.js';
import type { HolidayCalendar } from '../../domain/ports/holiday-calendar.js';
import type {
  CycleRepository,
  RecurringTemplateRepository,
  SettingsRepository,
} from '../../domain/ports/repositories.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import { LocalDate } from '../../domain/shared/local-date.js';
import { Money } from '../../domain/shared/money.js';
import { monthOf } from './month.js';

export class TemplateNotFound extends DomainError {}

/**
 * Whether a change applies to one cycle or to every cycle from here on. The
 * critical interaction of UC-2.3 — past cycles are never touched either way.
 */
export const EditScope = {
  ThisCycleOnly: 'THIS_CYCLE_ONLY',
  ThisAndFuture: 'THIS_AND_FUTURE',
} as const;

export type EditScope = (typeof EditScope)[keyof typeof EditScope];

export interface TemplateView {
  readonly id: string;
  readonly name: string;
  readonly direction: Direction;
  readonly dueDayOfMonth: number;
  readonly amountCents: number;
  readonly status: TemplateStatus;
  readonly isEstimate: boolean;
  readonly startMonth: string;
  readonly endMonth: string | undefined;
  readonly valueSchedule: readonly {
    fromMonth: string;
    amountCents: number;
  }[];
  /** The next cycle this template generates into, from today onward. */
  readonly nextOccurrenceMonth: string | undefined;
}

export interface TemplatesView {
  readonly templates: readonly TemplateView[];
}

const WINDOW = 12;

/** UC-2 — the recurring commitments that fill every future cycle. */
export class ManageTemplates {
  constructor(
    private readonly templates: RecurringTemplateRepository,
    private readonly cycles: CycleRepository,
    private readonly settings: SettingsRepository,
    private readonly holidays: HolidayCalendar,
    private readonly clock: Clock,
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  async list(): Promise<TemplatesView> {
    const templates = await this.templates.findAll();
    const anchor = await this.settings.load();
    const window = this.window(anchor);

    return {
      templates: templates.map((template) => this.toView(template, window)),
    };
  }

  async create(input: {
    name: string;
    direction: Direction;
    dueDayOfMonth: number;
    amountCents: number;
    startMonth?: string;
    endMonth?: string;
    isEstimate?: boolean;
  }): Promise<TemplateView> {
    const anchor = await this.settings.load();
    const template = RecurringTemplate.create({
      id: this.newId(),
      name: input.name,
      direction: input.direction,
      dueDayOfMonth: input.dueDayOfMonth,
      amount: Money.fromCents(input.amountCents),
      startMonth: input.startMonth ?? this.currentMonth(anchor),
      ...(input.endMonth === undefined ? {} : { endMonth: input.endMonth }),
      ...(input.isEstimate === undefined
        ? {}
        : { isEstimate: input.isEstimate }),
    });

    await this.templates.save(template);
    return this.toView(template, this.window(anchor));
  }

  /**
   * Changes an amount, with the scope choice that makes this whole feature
   * work.
   *
   * *This and future* appends a value-schedule step, so one template carries
   * the salary going from 10.000 to 18.000. *This cycle only* overrides the
   * generated entry and leaves the template alone. Past cycles are untouched
   * either way.
   */
  async changeAmount(input: {
    templateId: string;
    fromMonth: string;
    amountCents: number;
    scope: EditScope;
  }): Promise<TemplateView> {
    const template = await this.require(input.templateId);
    const anchor = await this.settings.load();
    const amount = Money.fromCents(input.amountCents);

    if (input.scope === EditScope.ThisAndFuture) {
      const scheduled = template.scheduleAmountFrom(input.fromMonth, amount);
      await this.templates.save(scheduled);
      return this.toView(scheduled, this.window(anchor));
    }

    const ref = CycleRef.forMonth(input.fromMonth, anchor, this.holidays);
    const cycle = await this.cycles.findByMonth(ref);
    const entry = cycle?.entries.find((candidate) =>
      generatedBy(candidate, template.id),
    );

    if (cycle !== undefined && entry !== undefined) {
      await this.cycles.save(cycle.overrideEntry(entry.id, amount));
    }

    return this.toView(template, this.window(anchor));
  }

  async rename(id: string, name: string): Promise<TemplateView> {
    return this.update(id, (template) => template.rename(name));
  }

  async pause(id: string): Promise<TemplateView> {
    return this.update(id, (template) => template.pause());
  }

  async resume(id: string): Promise<TemplateView> {
    return this.update(id, (template) => template.resume());
  }

  async endOn(id: string, month: string): Promise<TemplateView> {
    return this.update(id, (template) => template.endOn(month));
  }

  async flagAsEstimate(id: string, isEstimate: boolean): Promise<TemplateView> {
    return this.update(id, (template) => template.asEstimate(isEstimate));
  }

  async delete(id: string): Promise<void> {
    await this.require(id);
    await this.templates.delete(id);
  }

  private async update(
    id: string,
    change: (template: RecurringTemplate) => RecurringTemplate,
  ): Promise<TemplateView> {
    const changed = change(await this.require(id));
    await this.templates.save(changed);

    return this.toView(changed, this.window(await this.settings.load()));
  }

  private async require(id: string): Promise<RecurringTemplate> {
    const template = await this.templates.findById(id);
    if (template === undefined) {
      throw new TemplateNotFound(`Não há nenhuma recorrência ${id}.`);
    }
    return template;
  }

  private currentMonth(anchor: PaydayAnchor): string {
    return monthOf(
      LocalDate.fromInstant(this.clock.now()),
      anchor,
      this.holidays,
    );
  }

  private window(anchor: PaydayAnchor): readonly CycleRef[] {
    return CycleRef.rolling(
      this.currentMonth(anchor),
      WINDOW,
      anchor,
      this.holidays,
    );
  }

  private toView(
    template: RecurringTemplate,
    window: readonly CycleRef[],
  ): TemplateView {
    return {
      id: template.id,
      name: template.name,
      direction: template.direction,
      dueDayOfMonth: template.dueDayOfMonth,
      amountCents: template.baseAmount.cents,
      status: template.status,
      isEstimate: template.isEstimate,
      startMonth: template.startMonth,
      endMonth: template.endMonth,
      valueSchedule: template.valueSchedule.map((step) => ({
        fromMonth: step.fromMonth,
        amountCents: step.amount.cents,
      })),
      nextOccurrenceMonth: window.find((ref) => template.appliesTo(ref))?.month,
    };
  }
}

/** Looks through an override: an overridden entry is still its template's. */
function generatedBy(entry: LedgerEntry, templateId: string): boolean {
  const origin =
    entry.origin.kind === 'OVERRIDE' ? entry.origin.original : entry.origin;

  return origin.kind === 'FROM_TEMPLATE' && origin.templateId === templateId;
}
