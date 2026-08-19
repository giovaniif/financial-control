import type { AccountType } from '../../domain/budgeting/account.js';
import type { PaydayAnchor } from '../../domain/budgeting/cycle-ref.js';
import { CycleRef } from '../../domain/budgeting/cycle-ref.js';
import type {
  AllocationRule,
  BucketTarget,
} from '../../domain/goals/bucket.js';
import type { HolidayCalendar } from '../../domain/ports/holiday-calendar.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import type { Money } from '../../domain/shared/money.js';

/** A record arrived before the payday anchor every date it carries depends on. */
export class AnchorNotChosen extends DomainError {}

/** A proposed record the draft will not hold: a name, an amount, a day. */
export class InvalidSetupRecord extends DomainError {}

/** A due day the generator would silently drop from one of its cycles. */
export class DueDayOutsideCycle extends DomainError {}

export class SectionCannotBeSkipped extends DomainError {}

export const SetupSection = {
  Anchor: 'ANCHOR',
  Accounts: 'ACCOUNTS',
  Salary: 'SALARY',
  FixedBills: 'FIXED_BILLS',
  VariableBills: 'VARIABLE_BILLS',
  Cards: 'CARDS',
  Buckets: 'BUCKETS',
} as const;

export type SetupSection = (typeof SetupSection)[keyof typeof SetupSection];

/** The order the conversation asks in: each section depends on the last. */
export const SETUP_SECTIONS = [
  SetupSection.Anchor,
  SetupSection.Accounts,
  SetupSection.Salary,
  SetupSection.FixedBills,
  SetupSection.VariableBills,
  SetupSection.Cards,
  SetupSection.Buckets,
] as const;

export interface DraftAccount {
  readonly name: string;
  readonly type: AccountType;
  readonly balance: Money;
}

export interface DraftBill {
  readonly name: string;
  /** Outgoing, so negative — the sign the ledger and the templates use. */
  readonly amount: Money;
  readonly dueDayOfMonth: number;
  readonly isEstimate: boolean;
}

export interface DraftCard {
  readonly name: string;
  readonly limit: Money;
  readonly closingDay: number;
  readonly dueDay: number;
  /** Names an account the draft already holds; the conversation has no ids. */
  readonly paymentAccountName: string;
}

/**
 * A goal must carry its target and an ongoing bucket must not, so asking an
 * ongoing bucket for one does not compile. UC-6.1 — reporting progress toward
 * a target that does not exist is the bug the distinction prevents, and a
 * union is what makes it unaskable rather than merely wrong.
 */
export type DraftBucket =
  | {
      readonly mode: 'GOAL';
      readonly name: string;
      readonly rule: AllocationRule;
      readonly priority: number;
      readonly target: BucketTarget;
    }
  | {
      readonly mode: 'ONGOING';
      readonly name: string;
      readonly rule: AllocationRule;
      readonly priority: number;
    };

interface DraftState {
  readonly startMonth: string;
  readonly holidays: HolidayCalendar;
  readonly anchor: PaydayAnchor | undefined;
  readonly accounts: readonly DraftAccount[];
  readonly salary: Money | undefined;
  readonly fixedBills: readonly DraftBill[];
  readonly variableBills: readonly DraftBill[];
  readonly cards: readonly DraftCard[];
  readonly buckets: readonly DraftBucket[];
  readonly skipped: ReadonlySet<SetupSection>;
}

const MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/;

/** The rolling window the app holds, and so the cycles a bill must fit. */
const ROLLING_CYCLES = 12;

/**
 * UC-1.5 — what the setup conversation has established so far, and what it
 * still needs.
 *
 * Immutable: every answer returns a new draft, which is what makes the
 * conversation resumable from whatever the client sends back and what lets a
 * refused record leave the draft exactly as it was.
 *
 * It knows nothing about the model that filled it in. A form would produce the
 * same object, and the validation here is the only thing standing between a
 * hallucinated figure and the user's data — so it happens on the way in,
 * before a record is ever shown.
 */
export class SetupDraft {
  private constructor(private readonly state: DraftState) {}

  /**
   * `startMonth` is the cycle the setup begins in: it dates every template the
   * draft will compose, and it fixes the window a due day has to fit.
   */
  static empty(startMonth: string, holidays: HolidayCalendar): SetupDraft {
    if (!MONTH.test(startMonth)) {
      throw new InvalidSetupRecord(`Not a YYYY-MM month: "${startMonth}".`);
    }

    return new SetupDraft({
      startMonth,
      holidays,
      anchor: undefined,
      accounts: [],
      salary: undefined,
      fixedBills: [],
      variableBills: [],
      cards: [],
      buckets: [],
      skipped: new Set(),
    });
  }

  get startMonth(): string {
    return this.state.startMonth;
  }

  get anchor(): PaydayAnchor | undefined {
    return this.state.anchor;
  }

  get accounts(): readonly DraftAccount[] {
    return this.state.accounts;
  }

  get salary(): Money | undefined {
    return this.state.salary;
  }

  /**
   * The salary is dated by the payday anchor and never asked for separately —
   * a second answer could only disagree with the one already given (UC-2.2).
   */
  get salaryDueDayOfMonth(): number | undefined {
    return this.state.anchor?.dayOfMonth;
  }

  get fixedBills(): readonly DraftBill[] {
    return this.state.fixedBills;
  }

  get variableBills(): readonly DraftBill[] {
    return this.state.variableBills;
  }

  get cards(): readonly DraftCard[] {
    return this.state.cards;
  }

  get buckets(): readonly DraftBucket[] {
    return this.state.buckets;
  }

  /** What the conversation still has to ask about, in the order it asks. */
  get remainingSections(): readonly SetupSection[] {
    return SETUP_SECTIONS.filter(
      (section) => !this.hasAnswer(section) && !this.state.skipped.has(section),
    );
  }

  get nextSection(): SetupSection | undefined {
    return this.remainingSections[0];
  }

  /** Every section answered or skipped — the state a composition may run on. */
  get isComplete(): boolean {
    return this.remainingSections.length === 0;
  }

  /**
   * Chosen or corrected. A correction re-checks the bills already accepted,
   * because a due day that fitted the old anchor's cycles may fall in a gap
   * the new one leaves.
   */
  withAnchor(anchor: PaydayAnchor): SetupDraft {
    for (const bill of [
      ...this.state.fixedBills,
      ...this.state.variableBills,
    ]) {
      this.assertPlaceable(bill.name, bill.dueDayOfMonth, anchor);
    }

    return this.with({ anchor });
  }

  addAccount(proposed: {
    name: string;
    type: AccountType;
    balance: Money;
  }): SetupDraft {
    const name = requireUnusedName(
      'account',
      proposed.name,
      this.state.accounts.map((account) => account.name),
    );

    // An account may be overdrawn, so any balance is a legal one.
    return this.with({
      accounts: [
        ...this.state.accounts,
        { name, type: proposed.type, balance: proposed.balance },
      ],
    });
  }

  withSalary(amount: Money): SetupDraft {
    return this.with({ salary: requirePositive('A salary', amount) });
  }

  addFixedBill(proposed: {
    name: string;
    amount: Money;
    dueDayOfMonth: number;
    isEstimate?: boolean;
  }): SetupDraft {
    const bill = this.readBill(proposed, false);

    return this.with({ fixedBills: [...this.state.fixedBills, bill] });
  }

  /**
   * A bill whose amount moves — electricity, groceries — is an unconfirmed
   * estimate unless the user says otherwise, so a forecast never quietly
   * mixes a guess in with a known bill (UC-2.6).
   */
  addVariableBill(proposed: {
    name: string;
    amount: Money;
    dueDayOfMonth: number;
    isEstimate?: boolean;
  }): SetupDraft {
    const bill = this.readBill(proposed, true);

    return this.with({ variableBills: [...this.state.variableBills, bill] });
  }

  addCard(proposed: {
    name: string;
    limit: Money;
    closingDay: number;
    dueDay: number;
    paymentAccountName: string;
  }): SetupDraft {
    const name = requireUnusedName(
      'card',
      proposed.name,
      this.state.cards.map((card) => card.name),
    );
    if (proposed.limit.isNegative()) {
      throw new InvalidSetupRecord(
        `${name} cannot have a limit of ${proposed.limit.toReais()}.`,
      );
    }
    requireDayOfMonth('closing day', proposed.closingDay);
    requireDayOfMonth('due day', proposed.dueDay);

    // An invoice due date is a real date and cycles tile the calendar, so it
    // always lands in one: the gap that catches a bill's due day cannot catch
    // a card's, and checking for it here would refuse a card that works.
    const paymentAccount = this.state.accounts.find(
      (account) =>
        account.name.toLowerCase() ===
        proposed.paymentAccountName.trim().toLowerCase(),
    );
    if (paymentAccount === undefined) {
      throw new InvalidSetupRecord(
        `${name} is paid from an account called "${proposed.paymentAccountName}", which the setup does not hold.`,
      );
    }

    return this.with({
      cards: [
        ...this.state.cards,
        {
          name,
          limit: proposed.limit,
          closingDay: proposed.closingDay,
          dueDay: proposed.dueDay,
          paymentAccountName: paymentAccount.name,
        },
      ],
    });
  }

  addGoalBucket(proposed: {
    name: string;
    rule: AllocationRule;
    priority: number;
    target: BucketTarget;
  }): SetupDraft {
    const name = this.readBucketName(proposed.name);
    requireRuleAsksForSomething(name, proposed.rule);
    this.requireUnusedPriority(name, proposed.priority);
    requirePositive(`${name} is a goal, so its target`, proposed.target.amount);

    return this.with({
      buckets: [
        ...this.state.buckets,
        {
          mode: 'GOAL',
          name,
          rule: proposed.rule,
          priority: proposed.priority,
          target: proposed.target,
        },
      ],
    });
  }

  addOngoingBucket(proposed: {
    name: string;
    rule: AllocationRule;
    priority: number;
  }): SetupDraft {
    const name = this.readBucketName(proposed.name);
    requireRuleAsksForSomething(name, proposed.rule);
    this.requireUnusedPriority(name, proposed.priority);

    return this.with({
      buckets: [
        ...this.state.buckets,
        {
          mode: 'ONGOING',
          name,
          rule: proposed.rule,
          priority: proposed.priority,
        },
      ],
    });
  }

  /** Settles a section the user had nothing to say about. */
  skip(section: SetupSection): SetupDraft {
    if (section === SetupSection.Anchor) {
      throw new SectionCannotBeSkipped(
        'The payday anchor is what every date in the app is measured from, so it cannot be skipped.',
      );
    }

    return this.with({ skipped: new Set([...this.state.skipped, section]) });
  }

  private hasAnswer(section: SetupSection): boolean {
    const answered: Record<SetupSection, boolean> = {
      ANCHOR: this.state.anchor !== undefined,
      ACCOUNTS: this.state.accounts.length > 0,
      SALARY: this.state.salary !== undefined,
      FIXED_BILLS: this.state.fixedBills.length > 0,
      VARIABLE_BILLS: this.state.variableBills.length > 0,
      CARDS: this.state.cards.length > 0,
      BUCKETS: this.state.buckets.length > 0,
    };

    return answered[section];
  }

  private readBill(
    proposed: {
      name: string;
      amount: Money;
      dueDayOfMonth: number;
      isEstimate?: boolean;
    },
    isEstimateByDefault: boolean,
  ): DraftBill {
    const anchor = this.state.anchor;
    if (anchor === undefined) {
      throw new AnchorNotChosen(
        'A bill is dated inside a cycle, so the payday anchor comes first.',
      );
    }

    const name = requireUnusedName('bill', proposed.name, [
      ...this.state.fixedBills.map((bill) => bill.name),
      ...this.state.variableBills.map((bill) => bill.name),
    ]);
    requireDayOfMonth('due day', proposed.dueDayOfMonth);
    if (proposed.amount.isZero()) {
      throw new InvalidSetupRecord(`${name} cannot be a bill for nothing.`);
    }
    this.assertPlaceable(name, proposed.dueDayOfMonth, anchor);

    // The sign is normalised rather than demanded: "320" and "-320" are the
    // same statement about a bill, and a correction prompt about which one the
    // model happened to produce would be a prompt about nothing.
    return {
      name,
      amount: proposed.amount.abs().negate(),
      dueDayOfMonth: proposed.dueDayOfMonth,
      isEstimate: proposed.isEstimate ?? isEstimateByDefault,
    };
  }

  /**
   * A due day the cycle never reaches would generate nothing at all,
   * silently — the August cycle running 31 Aug – 29 Sep has no 30th. The
   * question is put to `CycleRef` rather than answered again here: the
   * generator clamps a day onto a short month's last day, and a second,
   * stricter rule in this file is exactly the bug FIN-93 fixed.
   */
  private assertPlaceable(
    name: string,
    dueDayOfMonth: number,
    anchor: PaydayAnchor,
  ): void {
    const window = CycleRef.rolling(
      this.state.startMonth,
      ROLLING_CYCLES,
      anchor,
      this.state.holidays,
    );

    for (const ref of window) {
      if (ref.dateForDayOfMonth(dueDayOfMonth) === undefined) {
        throw new DueDayOutsideCycle(
          `${name} falls due on day ${String(dueDayOfMonth)}, which the ${ref.label} cycle (${ref.range.toString()}) never reaches. Pick another day, or the cycle's last day.`,
        );
      }
    }
  }

  private readBucketName(name: string): string {
    return requireUnusedName(
      'bucket',
      name,
      this.state.buckets.map((bucket) => bucket.name),
    );
  }

  private requireUnusedPriority(name: string, priority: number): void {
    if (!Number.isSafeInteger(priority) || priority < 1) {
      throw new InvalidSetupRecord(
        `A priority is a whole number of at least 1; received ${String(priority)}.`,
      );
    }
    const taken = this.state.buckets.find(
      (bucket) => bucket.priority === priority,
    );
    if (taken !== undefined) {
      throw new InvalidSetupRecord(
        `${name} cannot be #${String(priority)}; ${taken.name} already is, and the order decides who is funded when the money runs short.`,
      );
    }
  }

  private with(changes: Partial<DraftState>): SetupDraft {
    return new SetupDraft({ ...this.state, ...changes });
  }
}

function requireUnusedName(
  what: string,
  name: string,
  taken: readonly string[],
): string {
  const trimmed = name.trim();
  if (trimmed === '') {
    throw new InvalidSetupRecord(`A ${what} needs a name.`);
  }
  if (taken.some((used) => used.toLowerCase() === trimmed.toLowerCase())) {
    throw new InvalidSetupRecord(
      `There is already a ${what} called "${trimmed}".`,
    );
  }
  return trimmed;
}

function requireDayOfMonth(what: string, day: number): void {
  if (!Number.isSafeInteger(day) || day < 1 || day > 31) {
    throw new InvalidSetupRecord(
      `A ${what} is a day of the month; received ${String(day)}.`,
    );
  }
}

function requirePositive(what: string, amount: Money): Money {
  if (!amount.isPositive()) {
    throw new InvalidSetupRecord(
      `${what} must be more than nothing; received ${amount.toReais()}.`,
    );
  }
  return amount;
}

function requireRuleAsksForSomething(name: string, rule: AllocationRule): void {
  const asksForNothing =
    rule.kind === 'PERCENT'
      ? rule.percentage.isZero()
      : !rule.amount.isPositive();

  if (asksForNothing) {
    throw new InvalidSetupRecord(
      `${name} needs an allocation rule that puts something in it each cycle.`,
    );
  }
}
