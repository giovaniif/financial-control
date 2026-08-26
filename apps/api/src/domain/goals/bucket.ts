import { DomainError } from '../shared/domain-error.js';
import type { LocalDate } from '../shared/local-date.js';
import { Money } from '../shared/money.js';
import type { Percentage } from '../shared/percentage.js';
import type { BucketEvent } from './bucket-event.js';
import {
  applyEvent,
  BucketEvents,
  foldBalance,
  totalContributed,
  totalYield,
} from './bucket-event.js';

export class InvalidBucket extends DomainError {}
export class WithdrawalTooLarge extends DomainError {}

export const BucketMode = {
  /** A target amount by a target date. Progress is measured against it. */
  Goal: 'GOAL',
  /** A per-cycle amount with no end and nothing to complete. */
  Ongoing: 'ONGOING',
} as const;

export type BucketMode = (typeof BucketMode)[keyof typeof BucketMode];

export const BucketStatus = {
  Active: 'ACTIVE',
  Archived: 'ARCHIVED',
} as const;

export type BucketStatus = (typeof BucketStatus)[keyof typeof BucketStatus];

/** How much of a cycle's Expected Surplus this bucket asks for. */
export type AllocationRule =
  | { readonly kind: 'PERCENT'; readonly percentage: Percentage }
  | { readonly kind: 'FIXED'; readonly amount: Money };

export const Allocation = {
  percentOfExpectedSurplus: (percentage: Percentage): AllocationRule => ({
    kind: 'PERCENT',
    percentage,
  }),
  fixed: (amount: Money): AllocationRule => ({ kind: 'FIXED', amount }),
} as const;

/** A goal's target, which an ongoing bucket does not have. */
export interface BucketTarget {
  readonly amount: Money;
  readonly date: LocalDate;
}

interface BucketState {
  readonly id: string;
  readonly name: string;
  readonly purpose: string;
  readonly mode: BucketMode;
  readonly target: BucketTarget | undefined;
  readonly rule: AllocationRule;
  readonly priority: number;
  readonly expectedYield: Percentage | undefined;
  readonly status: BucketStatus;
  readonly events: readonly BucketEvent[];
}

/**
 * A pot of savings fed by a rule each cycle.
 *
 * **`mode` is a real invariant, not a display flag.** A `GOAL` must have a
 * target and a target date; an `ONGOING` must have neither, and asking it for
 * progress returns nothing rather than a meaningless fraction. Reporting
 * progress toward a target that does not exist is the specific bug this
 * prevents.
 */
export class Bucket {
  private constructor(private readonly state: BucketState) {}

  static goal(input: {
    id: string;
    name: string;
    purpose?: string;
    target: BucketTarget;
    rule: AllocationRule;
    priority: number;
    expectedYield?: Percentage;
    status?: BucketStatus;
    events?: readonly BucketEvent[];
  }): Bucket {
    return Bucket.create({ ...input, mode: BucketMode.Goal });
  }

  static ongoing(input: {
    id: string;
    name: string;
    purpose?: string;
    rule: AllocationRule;
    priority: number;
    expectedYield?: Percentage;
    status?: BucketStatus;
    events?: readonly BucketEvent[];
  }): Bucket {
    return Bucket.create({ ...input, mode: BucketMode.Ongoing });
  }

  private static create(input: {
    id: string;
    name: string;
    purpose?: string;
    mode: BucketMode;
    target?: BucketTarget;
    rule: AllocationRule;
    priority: number;
    expectedYield?: Percentage;
    status?: BucketStatus;
    events?: readonly BucketEvent[];
  }): Bucket {
    if (input.name.trim() === '') {
      throw new InvalidBucket('Uma caixinha precisa de um nome.');
    }
    if (input.mode === BucketMode.Goal && input.target === undefined) {
      throw new InvalidBucket(
        `${input.name} é uma meta, então precisa de um valor-alvo e de uma data-alvo.`,
      );
    }
    if (input.target !== undefined && !input.target.amount.isPositive()) {
      throw new InvalidBucket(
        `${input.name} é uma meta, então o valor-alvo tem de ser maior que zero.`,
      );
    }
    if (input.mode === BucketMode.Ongoing && input.target !== undefined) {
      throw new InvalidBucket(
        `${input.name} é contínua, então não tem valor-alvo — não há nada a completar.`,
      );
    }
    if (!Number.isSafeInteger(input.priority) || input.priority < 1) {
      throw new InvalidBucket(
        `A prioridade é um número inteiro de pelo menos 1; recebido ${String(input.priority)}.`,
      );
    }

    return new Bucket({
      id: input.id,
      name: input.name.trim(),
      purpose: input.purpose ?? '',
      mode: input.mode,
      target: input.target,
      rule: input.rule,
      priority: input.priority,
      expectedYield: input.expectedYield,
      status: input.status ?? BucketStatus.Active,
      events: input.events ?? [],
    });
  }

  get id(): string {
    return this.state.id;
  }

  get name(): string {
    return this.state.name;
  }

  get purpose(): string {
    return this.state.purpose;
  }

  get mode(): BucketMode {
    return this.state.mode;
  }

  get isGoal(): boolean {
    return this.state.mode === BucketMode.Goal;
  }

  get target(): BucketTarget | undefined {
    return this.state.target;
  }

  get rule(): AllocationRule {
    return this.state.rule;
  }

  get priority(): number {
    return this.state.priority;
  }

  get expectedYield(): Percentage | undefined {
    return this.state.expectedYield;
  }

  get status(): BucketStatus {
    return this.state.status;
  }

  get isArchived(): boolean {
    return this.state.status === BucketStatus.Archived;
  }

  get events(): readonly BucketEvent[] {
    return this.state.events;
  }

  /** The fold over the log — never a stored figure. */
  get balance(): Money {
    return foldBalance(this.state.events);
  }

  /** Growth from saving, kept apart from growth from returns. */
  get contributed(): Money {
    return totalContributed(this.state.events);
  }

  get yielded(): Money {
    return totalYield(this.state.events);
  }

  /** What this bucket asks for from a cycle's Expected Surplus. */
  requestFor(expectedSurplus: Money): Money {
    // A negative Expected Surplus allocates nothing: there is nothing to
    // allocate, and a negative contribution is not a thing.
    if (!expectedSurplus.isPositive()) {
      return Money.zero();
    }
    return this.state.rule.kind === 'PERCENT'
      ? this.state.rule.percentage.of(expectedSurplus)
      : this.state.rule.amount;
  }

  /** Undefined for an ongoing bucket: there is no target to be part-way to. */
  get percentComplete(): number | undefined {
    const target = this.state.target;
    if (target === undefined) {
      return undefined;
    }
    return Math.min(
      100,
      Math.round((this.balance.cents / target.amount.cents) * 100),
    );
  }

  get isComplete(): boolean {
    const target = this.state.target;
    return target !== undefined && !this.balance.isLessThan(target.amount);
  }

  contribute(id: string, cycleMonth: string, amount: Money): Bucket {
    return this.append(BucketEvents.contribution(id, cycleMonth, amount));
  }

  /** A deliberate different amount for one cycle. The rule is a default. */
  overrideContribution(
    id: string,
    cycleMonth: string,
    amount: Money,
    ruleWouldHaveBeen: Money,
  ): Bucket {
    return this.append(
      BucketEvents.override(id, cycleMonth, amount, ruleWouldHaveBeen),
    );
  }

  recordYield(id: string, date: LocalDate, amount: Money): Bucket {
    return this.append(BucketEvents.yield(id, date, amount));
  }

  correctBalance(
    id: string,
    date: LocalDate,
    newBalance: Money,
    reason: string,
  ): Bucket {
    return this.append(BucketEvents.correction(id, date, newBalance, reason));
  }

  withdraw(id: string, date: LocalDate, amount: Money, reason: string): Bucket {
    const event = BucketEvents.withdrawal(id, date, amount, reason);
    if (applyEvent(this.balance, event).isNegative()) {
      throw new WithdrawalTooLarge(
        `${this.state.name} tem R$ ${this.balance.toReais()}; não dá para tirar R$ ${amount.toReais()}.`,
      );
    }
    return this.append(event);
  }

  /** The contribution recorded for a cycle, if the rule already ran. */
  contributionFor(cycleMonth: string): Money | undefined {
    const recorded = this.state.events.filter(
      (event) =>
        (event.kind === 'CONTRIBUTION' || event.kind === 'OVERRIDE') &&
        event.cycleMonth === cycleMonth,
    );

    return recorded.length === 0
      ? undefined
      : Money.sum(
          recorded.map((event) =>
            event.kind === 'CONTRIBUTION' || event.kind === 'OVERRIDE'
              ? event.amount
              : Money.zero(),
          ),
        );
  }

  changeRule(rule: AllocationRule): Bucket {
    return this.with({ rule });
  }

  changePriority(priority: number): Bucket {
    if (!Number.isSafeInteger(priority) || priority < 1) {
      throw new InvalidBucket(
        `A prioridade é um número inteiro de pelo menos 1; recebido ${String(priority)}.`,
      );
    }
    return this.with({ priority });
  }

  setExpectedYield(expectedYield: Percentage): Bucket {
    return this.with({ expectedYield });
  }

  /** Keeps the history rather than deleting it, and leaves projections. */
  archive(): Bucket {
    return this.with({ status: BucketStatus.Archived });
  }

  /**
   * Gives the bucket something to aim at — UC-6.1.
   *
   * `mode` and `target` move together because they are one invariant, not two
   * fields: a goal with no target is the state `percentComplete` has no
   * answer for, which is the specific bug UC-6.1 exists to prevent. Setting
   * one without the other is therefore not something this aggregate can be
   * asked to do.
   *
   * The event log is untouched. Contributions, yields and corrections belong
   * to the bucket rather than to its mode, and the balance is the fold over
   * them either way.
   */
  aimFor(target: BucketTarget): Bucket {
    if (!target.amount.isPositive()) {
      throw new InvalidBucket(
        `${this.state.name} é uma meta, então o valor-alvo tem de ser maior que zero.`,
      );
    }

    return this.with({ mode: BucketMode.Goal, target });
  }

  /**
   * Takes the target away, leaving an ongoing commitment — the other half of
   * UC-6.1, because a goal that turns out to have no finish line is as real
   * as a pot that gains one.
   *
   * Not the same as archiving (UC-6.8), which is for a goal reached and
   * spent. Dropping a target is not an ending, and nothing is dimmed or
   * removed from the projections by it.
   */
  stopAiming(): Bucket {
    return this.with({ mode: BucketMode.Ongoing, target: undefined });
  }

  private append(event: BucketEvent): Bucket {
    return this.with({ events: [...this.state.events, event] });
  }

  private with(changes: Partial<BucketState>): Bucket {
    return new Bucket({ ...this.state, ...changes });
  }
}
