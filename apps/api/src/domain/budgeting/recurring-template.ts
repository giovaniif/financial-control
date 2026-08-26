import { DomainError } from '../shared/domain-error.js';
import type { LocalDate } from '../shared/local-date.js';
import type { Money } from '../shared/money.js';
import type { CycleRef } from './cycle-ref.js';
import { EntryKind } from './ledger-entry.js';

export class InvalidTemplate extends DomainError {}

export const Direction = {
  In: 'IN',
  Out: 'OUT',
} as const;

export type Direction = (typeof Direction)[keyof typeof Direction];

export const TemplateStatus = {
  Active: 'ACTIVE',
  Paused: 'PAUSED',
  Ended: 'ENDED',
} as const;

export type TemplateStatus =
  (typeof TemplateStatus)[keyof typeof TemplateStatus];

/** An amount that applies from one cycle onward, until the next step. */
export interface ValueScheduleStep {
  /** `YYYY-MM`, the cycle this amount starts applying from. */
  readonly fromMonth: string;
  readonly amount: Money;
}

interface TemplateState {
  readonly id: string;
  readonly name: string;
  readonly direction: Direction;
  readonly dueDayOfMonth: number;
  readonly baseAmount: Money;
  readonly valueSchedule: readonly ValueScheduleStep[];
  readonly startMonth: string;
  readonly endMonth: string | undefined;
  readonly status: TemplateStatus;
  readonly isEstimate: boolean;
}

/**
 * A recurring income or outcome: the engine that fills future cycles.
 *
 * The value schedule is what makes "salary rises from 10.000 to 18.000 in
 * September" and "the renovation climbs 1.200 → 1.340 over four cycles" the
 * same mechanism rather than two features — and it is why a raise is one
 * template with a step rather than two templates or twelve manual edits.
 */
export class RecurringTemplate {
  private constructor(private readonly state: TemplateState) {}

  static create(input: {
    id: string;
    name: string;
    direction: Direction;
    dueDayOfMonth: number;
    amount: Money;
    startMonth: string;
    endMonth?: string;
    isEstimate?: boolean;
    valueSchedule?: readonly ValueScheduleStep[];
    status?: TemplateStatus;
  }): RecurringTemplate {
    if (input.name.trim() === '') {
      throw new InvalidTemplate('Uma recorrência precisa de um nome.');
    }
    if (
      !Number.isSafeInteger(input.dueDayOfMonth) ||
      input.dueDayOfMonth < 1 ||
      input.dueDayOfMonth > 31
    ) {
      throw new InvalidTemplate(
        `O dia de vencimento é um dia do mês; recebido ${String(input.dueDayOfMonth)}.`,
      );
    }
    assertMonth(input.startMonth);
    if (input.endMonth !== undefined) {
      assertMonth(input.endMonth);
      if (input.endMonth < input.startMonth) {
        throw new InvalidTemplate(
          `Uma recorrência não pode terminar (${input.endMonth}) antes de começar (${input.startMonth}).`,
        );
      }
    }
    for (const step of input.valueSchedule ?? []) {
      assertMonth(step.fromMonth);
    }

    return new RecurringTemplate({
      id: input.id,
      name: input.name.trim(),
      direction: input.direction,
      dueDayOfMonth: input.dueDayOfMonth,
      baseAmount: signed(input.amount, input.direction),
      // Sorted so resolution is a scan for the latest step at or before a
      // cycle, whatever order the steps arrived in.
      valueSchedule: [...(input.valueSchedule ?? [])]
        .map((step) => ({
          ...step,
          amount: signed(step.amount, input.direction),
        }))
        .sort((a, b) => a.fromMonth.localeCompare(b.fromMonth)),
      startMonth: input.startMonth,
      endMonth: input.endMonth,
      status: input.status ?? TemplateStatus.Active,
      isEstimate: input.isEstimate ?? false,
    });
  }

  get id(): string {
    return this.state.id;
  }

  get name(): string {
    return this.state.name;
  }

  get direction(): Direction {
    return this.state.direction;
  }

  get dueDayOfMonth(): number {
    return this.state.dueDayOfMonth;
  }

  get baseAmount(): Money {
    return this.state.baseAmount;
  }

  get valueSchedule(): readonly ValueScheduleStep[] {
    return this.state.valueSchedule;
  }

  get hasValueSchedule(): boolean {
    return this.state.valueSchedule.length > 0;
  }

  get startMonth(): string {
    return this.state.startMonth;
  }

  get endMonth(): string | undefined {
    return this.state.endMonth;
  }

  get status(): TemplateStatus {
    return this.state.status;
  }

  get isEstimate(): boolean {
    return this.state.isEstimate;
  }

  /** Income lands as `INCOME`; everything outgoing is a `FIXED` outcome. */
  get entryKind(): EntryKind {
    return this.state.direction === Direction.In
      ? EntryKind.Income
      : EntryKind.Fixed;
  }

  /**
   * Whether this template produces an entry in the given cycle: it must be
   * active, and the cycle must fall within its start and end.
   */
  appliesTo(ref: CycleRef): boolean {
    if (this.state.status !== TemplateStatus.Active) {
      return false;
    }
    if (ref.month < this.state.startMonth) {
      return false;
    }
    return (
      this.state.endMonth === undefined || ref.month <= this.state.endMonth
    );
  }

  /**
   * The amount for a cycle: the latest schedule step at or before it, or the
   * base amount when no step applies yet.
   */
  amountFor(ref: CycleRef): Money {
    return this.state.valueSchedule.reduce<Money>(
      (amount, step) => (step.fromMonth <= ref.month ? step.amount : amount),
      this.state.baseAmount,
    );
  }

  /**
   * The date the entry falls due inside a cycle.
   *
   * The due day is a day of the *month*, but a cycle spans two of them — the
   * August cycle running 5 Aug → 3 Sep contains a 3rd only in September. So
   * the candidate is tried in the cycle's start month first and then in the
   * next, and whichever lands inside the cycle wins.
   */
  dueDateIn(ref: CycleRef): LocalDate | undefined {
    return ref.dateForDayOfMonth(this.state.dueDayOfMonth);
  }

  /** Appends a step, so the new amount applies from that cycle onward. */
  scheduleAmountFrom(fromMonth: string, amount: Money): RecurringTemplate {
    assertMonth(fromMonth);

    const withoutClash = this.state.valueSchedule.filter(
      (step) => step.fromMonth !== fromMonth,
    );
    const step = { fromMonth, amount: signed(amount, this.state.direction) };

    return this.with({
      valueSchedule: [...withoutClash, step].sort((a, b) =>
        a.fromMonth.localeCompare(b.fromMonth),
      ),
    });
  }

  rename(name: string): RecurringTemplate {
    if (name.trim() === '') {
      throw new InvalidTemplate('Uma recorrência precisa de um nome.');
    }
    return this.with({ name: name.trim() });
  }

  pause(): RecurringTemplate {
    if (this.state.status === TemplateStatus.Ended) {
      throw new InvalidTemplate(
        `${this.state.name} já terminou; não dá para pausá-la.`,
      );
    }
    return this.with({ status: TemplateStatus.Paused });
  }

  resume(): RecurringTemplate {
    if (this.state.status === TemplateStatus.Ended) {
      throw new InvalidTemplate(
        `${this.state.name} já terminou; crie uma nova recorrência no lugar dela.`,
      );
    }
    return this.with({ status: TemplateStatus.Active });
  }

  /** Stops future generation without deleting what it already produced. */
  endOn(month: string): RecurringTemplate {
    assertMonth(month);
    if (month < this.state.startMonth) {
      throw new InvalidTemplate(
        `Uma recorrência não pode terminar (${month}) antes de começar (${this.state.startMonth}).`,
      );
    }
    return this.with({ endMonth: month });
  }

  markEnded(): RecurringTemplate {
    return this.with({ status: TemplateStatus.Ended });
  }

  asEstimate(isEstimate: boolean): RecurringTemplate {
    return this.with({ isEstimate });
  }

  private with(changes: Partial<TemplateState>): RecurringTemplate {
    return new RecurringTemplate({ ...this.state, ...changes });
  }
}

const MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/;

function assertMonth(month: string): void {
  if (!MONTH.test(month)) {
    throw new InvalidTemplate(`Não é um mês no formato YYYY-MM: "${month}".`);
  }
}

/**
 * The amount an `IN` or `OUT` template holds, signed the way the ledger signs
 * it: outgoing money is negative, incoming money is positive.
 *
 * The direction is what the user chose and the sign is bookkeeping, so the
 * aggregate settles it rather than trusting every caller to agree —
 * `"320"` and `"-320"` are the same statement about a bill. Left to the
 * callers they did disagree: the setup conversation negated and the Profile
 * form did not, so a bill added by hand generated a `FIXED` entry that added
 * money to the cycle instead of taking it out.
 */
function signed(amount: Money, direction: Direction): Money {
  return direction === Direction.In ? amount.abs() : amount.abs().negate();
}
