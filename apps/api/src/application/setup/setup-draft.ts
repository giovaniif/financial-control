import type { AccountType } from '../../domain/budgeting/account.js';
import type { PaydayAnchor } from '../../domain/budgeting/cycle-ref.js';
import { CycleRef } from '../../domain/budgeting/cycle-ref.js';
import type {
  AllocationRule,
  BucketTarget,
} from '../../domain/goals/bucket.js';
import type { HolidayCalendar } from '../../domain/ports/holiday-calendar.js';
import type { IdSource } from '../../domain/ports/id-source.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import type { LocalDate } from '../../domain/shared/local-date.js';
import type { Money } from '../../domain/shared/money.js';

/** A record arrived before the payday anchor every date it carries depends on. */
export class AnchorNotChosen extends DomainError {}

/** A proposed record the draft will not hold: a name, an amount, a day. */
export class InvalidSetupRecord extends DomainError {}

/**
 * One cycle in the rolling window that cannot reach a due day, and the day it
 * offers in its place — its own last day, which every cycle has.
 */
export interface UnreachableCycle {
  readonly month: string;
  readonly label: string;
  /** The cycle's bounds, as the refusal states them. */
  readonly range: string;
  readonly fallbackDate: LocalDate;
  readonly fallbackDayOfMonth: number;
}

/**
 * A due day the generator would silently drop from one of its cycles.
 *
 * It carries the cycles rather than only a sentence, so the caller can make
 * the offer the refusal describes instead of leaving the user to invent a
 * different day — FIN-117.
 */
export class DueDayOutsideCycle extends DomainError {
  constructor(
    message: string,
    readonly dueDayOfMonth: number,
    readonly cycles: readonly UnreachableCycle[],
  ) {
    super(message);
  }
}

export class SectionCannotBeSkipped extends DomainError {}

/** A correction naming a record the draft never established. */
export class SetupRecordNotFound extends DomainError {}

export const SetupSection = {
  Anchor: 'ANCHOR',
  Accounts: 'ACCOUNTS',
  Salary: 'SALARY',
  FixedBills: 'FIXED_BILLS',
  VariableBills: 'VARIABLE_BILLS',
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
  SetupSection.Buckets,
] as const;

export interface DraftAccount {
  readonly id: string;
  readonly name: string;
  readonly type: AccountType;
  readonly balance: Money;
}

/** The date one cycle uses for a bill whose due day it cannot reach. */
export interface DueDateOverride {
  readonly month: string;
  readonly date: LocalDate;
}

export interface DraftBill {
  readonly id: string;
  readonly name: string;
  /** Outgoing, so negative — the sign the ledger and the templates use. */
  readonly amount: Money;
  readonly dueDayOfMonth: number;
  readonly isEstimate: boolean;
  /** The user took the cycle's last day where the due day cannot be placed. */
  readonly acceptsCycleFallback: boolean;
  /**
   * Only the cycles that cannot reach {@link dueDayOfMonth}; empty when every
   * one can. The due day itself is never rewritten — the bill really is on
   * the 4th, and the other eleven cycles say so.
   */
  readonly dueDateOverrides: readonly DueDateOverride[];
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
      readonly id: string;
      readonly name: string;
      readonly rule: AllocationRule;
      readonly priority: number;
      readonly target: BucketTarget;
    }
  | {
      readonly mode: 'ONGOING';
      readonly id: string;
      readonly name: string;
      readonly rule: AllocationRule;
      readonly priority: number;
    };

export interface ProposedBill {
  readonly name: string;
  readonly amount: Money;
  readonly dueDayOfMonth: number;
  readonly isEstimate?: boolean;
  /**
   * The offer the refusal made, taken: the cycles that cannot reach the due
   * day use their own last day, and the day stands everywhere else. Only ever
   * set once the user has agreed — FIN-117.
   */
  readonly acceptCycleFallback?: boolean;
}

export interface ProposedBucket {
  readonly name: string;
  readonly rule: AllocationRule;
  readonly priority: number;
}

export interface ProposedGoalBucket extends ProposedBucket {
  readonly target: BucketTarget;
}

/**
 * One record the draft holds, tagged with the section that asked for it, so a
 * correction can be addressed by id alone — the caller does not have to know
 * what kind of thing it is naming, and cannot rewrite the wrong row by
 * guessing.
 */
export type DraftRecord =
  | { readonly section: 'ACCOUNTS'; readonly record: DraftAccount }
  | { readonly section: 'FIXED_BILLS'; readonly record: DraftBill }
  | { readonly section: 'VARIABLE_BILLS'; readonly record: DraftBill }
  | { readonly section: 'BUCKETS'; readonly record: DraftBucket };

interface DraftState {
  readonly startMonth: string;
  readonly holidays: HolidayCalendar;
  readonly ids: IdSource;
  readonly anchor: PaydayAnchor | undefined;
  readonly accounts: readonly DraftAccount[];
  readonly salary: Money | undefined;
  readonly fixedBills: readonly DraftBill[];
  readonly variableBills: readonly DraftBill[];
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
  static empty(
    startMonth: string,
    holidays: HolidayCalendar,
    ids: IdSource,
  ): SetupDraft {
    if (!MONTH.test(startMonth)) {
      throw new InvalidSetupRecord(
        `Não é um mês no formato YYYY-MM: "${startMonth}".`,
      );
    }

    return new SetupDraft({
      startMonth,
      holidays,
      ids,
      anchor: undefined,
      accounts: [],
      salary: undefined,
      fixedBills: [],
      variableBills: [],
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

  get buckets(): readonly DraftBucket[] {
    return this.state.buckets;
  }

  /** Everything a correction can address, in the order it was established. */
  get records(): readonly DraftRecord[] {
    return [
      ...this.state.accounts.map((record): DraftRecord => ({
        section: 'ACCOUNTS',
        record,
      })),
      ...this.state.fixedBills.map((record): DraftRecord => ({
        section: 'FIXED_BILLS',
        record,
      })),
      ...this.state.variableBills.map((record): DraftRecord => ({
        section: 'VARIABLE_BILLS',
        record,
      })),
      ...this.state.buckets.map((record): DraftRecord => ({
        section: 'BUCKETS',
        record,
      })),
    ];
  }

  find(id: string): DraftRecord | undefined {
    return this.records.find((held) => held.record.id === id);
  }

  /** The record under that id, for a caller that knows there has to be one. */
  record(id: string): DraftRecord {
    const held = this.find(id);
    if (held === undefined) {
      throw new SetupRecordNotFound(
        `A configuração não tem nada registrado como "${id}".`,
      );
    }
    return held;
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
    const revised = (bills: readonly DraftBill[]): DraftBill[] =>
      bills.map((bill) => this.reviseBill(bill, anchor));

    return this.with({
      anchor,
      fixedBills: revised(this.state.fixedBills),
      variableBills: revised(this.state.variableBills),
    });
  }

  addAccount(proposed: {
    name: string;
    type: AccountType;
    balance: Money;
  }): SetupDraft {
    const account = this.readAccount(this.state.ids.next(), proposed);

    return this.with({ accounts: [...this.state.accounts, account] });
  }

  replaceAccount(
    id: string,
    proposed: { name: string; type: AccountType; balance: Money },
  ): SetupDraft {
    existing(this.state.accounts, id, ACCOUNT);
    const account = this.readAccount(id, proposed);

    return this.with({ accounts: replacing(this.state.accounts, account) });
  }

  withSalary(amount: Money): SetupDraft {
    return this.with({ salary: requirePositive('O salário', amount) });
  }

  addFixedBill(proposed: ProposedBill): SetupDraft {
    const bill = this.readBill(this.state.ids.next(), proposed, false);

    return this.with({ fixedBills: [...this.state.fixedBills, bill] });
  }

  replaceFixedBill(id: string, proposed: ProposedBill): SetupDraft {
    existing(this.state.fixedBills, id, FIXED_BILL);

    return this.with({
      fixedBills: replacing(
        this.state.fixedBills,
        this.readBill(id, proposed, false),
      ),
    });
  }

  /**
   * A bill whose amount moves — electricity, groceries — is an unconfirmed
   * estimate unless the user says otherwise, so a forecast never quietly
   * mixes a guess in with a known bill (UC-2.6).
   */
  addVariableBill(proposed: ProposedBill): SetupDraft {
    const bill = this.readBill(this.state.ids.next(), proposed, true);

    return this.with({ variableBills: [...this.state.variableBills, bill] });
  }

  replaceVariableBill(id: string, proposed: ProposedBill): SetupDraft {
    existing(this.state.variableBills, id, VARIABLE_BILL);

    return this.with({
      variableBills: replacing(
        this.state.variableBills,
        this.readBill(id, proposed, true),
      ),
    });
  }

  addGoalBucket(proposed: ProposedGoalBucket): SetupDraft {
    const bucket = this.readGoalBucket(this.state.ids.next(), proposed);

    return this.with({ buckets: [...this.state.buckets, bucket] });
  }

  replaceGoalBucket(id: string, proposed: ProposedGoalBucket): SetupDraft {
    existing(this.state.buckets, id, BUCKET);

    return this.with({
      buckets: replacing(this.state.buckets, this.readGoalBucket(id, proposed)),
    });
  }

  addOngoingBucket(proposed: ProposedBucket): SetupDraft {
    const bucket = this.readOngoingBucket(this.state.ids.next(), proposed);

    return this.with({ buckets: [...this.state.buckets, bucket] });
  }

  replaceOngoingBucket(id: string, proposed: ProposedBucket): SetupDraft {
    existing(this.state.buckets, id, BUCKET);

    return this.with({
      buckets: replacing(
        this.state.buckets,
        this.readOngoingBucket(id, proposed),
      ),
    });
  }

  /**
   * Dropped, not skipped: the user is saying one record was wrong, never that
   * they have none of that kind. A section left empty by a removal is asked
   * about again; a skipped one is settled.
   */
  remove(id: string): SetupDraft {
    const held = this.record(id);

    switch (held.section) {
      case 'ACCOUNTS':
        return this.with({ accounts: without(this.state.accounts, id) });
      case 'FIXED_BILLS':
        return this.with({ fixedBills: without(this.state.fixedBills, id) });
      case 'VARIABLE_BILLS':
        return this.with({
          variableBills: without(this.state.variableBills, id),
        });
      case 'BUCKETS':
        return this.with({ buckets: without(this.state.buckets, id) });
      default: {
        const unreachable: never = held;
        return unreachable;
      }
    }
  }

  /** Settles a section the user had nothing to say about. */
  skip(section: SetupSection): SetupDraft {
    if (section === SetupSection.Anchor) {
      throw new SectionCannotBeSkipped(
        'O dia do pagamento é a partir do que toda data do app é medida, então ele não pode ser pulado.',
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
      BUCKETS: this.state.buckets.length > 0,
    };

    return answered[section];
  }

  private readAccount(
    id: string,
    proposed: { name: string; type: AccountType; balance: Money },
  ): DraftAccount {
    const name = requireUnusedName(
      ACCOUNT,
      proposed.name,
      namesOthersHold(this.state.accounts, id),
    );

    // An account may be overdrawn, so any balance is a legal one.
    return { id, name, type: proposed.type, balance: proposed.balance };
  }

  /**
   * A correction is read exactly as an addition is, `id` and all: the record
   * it replaces having been valid says nothing about the one replacing it,
   * and the rule a mis-extracted due day breaks is the one below (FIN-93).
   */
  private readBill(
    id: string,
    proposed: ProposedBill,
    isEstimateByDefault: boolean,
  ): DraftBill {
    const anchor = this.state.anchor;
    if (anchor === undefined) {
      throw new AnchorNotChosen(
        'Uma conta é datada dentro de um ciclo, então o dia do pagamento vem primeiro.',
      );
    }

    const name = requireUnusedName(BILL, proposed.name, [
      ...namesOthersHold(this.state.fixedBills, id),
      ...namesOthersHold(this.state.variableBills, id),
    ]);
    requireDayOfMonth('vencimento', proposed.dueDayOfMonth);
    if (proposed.amount.isZero()) {
      throw new InvalidSetupRecord(
        `${name} não pode ser uma conta de valor zero.`,
      );
    }

    const acceptsCycleFallback = proposed.acceptCycleFallback ?? false;
    const dueDateOverrides = this.placeOrOffer(
      name,
      proposed.dueDayOfMonth,
      anchor,
      acceptsCycleFallback,
    );

    // The sign is normalised rather than demanded: "320" and "-320" are the
    // same statement about a bill, and a correction prompt about which one the
    // model happened to produce would be a prompt about nothing.
    return {
      id,
      name,
      amount: proposed.amount.abs().negate(),
      dueDayOfMonth: proposed.dueDayOfMonth,
      isEstimate: proposed.isEstimate ?? isEstimateByDefault,
      acceptsCycleFallback,
      dueDateOverrides,
    };
  }

  /**
   * A bill the draft already holds, under a different anchor. The user agreed
   * to the cycle's last day for this bill rather than to three particular
   * dates, so a re-sliced window works the fallbacks out again; one that never
   * had the offer put to it is refused exactly as it was on the way in.
   */
  private reviseBill(bill: DraftBill, anchor: PaydayAnchor): DraftBill {
    return {
      ...bill,
      dueDateOverrides: this.placeOrOffer(
        bill.name,
        bill.dueDayOfMonth,
        anchor,
        bill.acceptsCycleFallback,
      ),
    };
  }

  private readGoalBucket(
    id: string,
    proposed: ProposedGoalBucket,
  ): DraftBucket {
    const name = this.readBucketName(id, proposed);
    requirePositive(
      `${name} é uma meta, então o valor-alvo`,
      proposed.target.amount,
    );

    return {
      mode: 'GOAL',
      id,
      name,
      rule: proposed.rule,
      priority: proposed.priority,
      target: proposed.target,
    };
  }

  private readOngoingBucket(id: string, proposed: ProposedBucket): DraftBucket {
    return {
      mode: 'ONGOING',
      id,
      name: this.readBucketName(id, proposed),
      rule: proposed.rule,
      priority: proposed.priority,
    };
  }

  /**
   * A due day the cycle never reaches would generate nothing at all,
   * silently — the August cycle running 31 Aug – 29 Sep has no 30th. The
   * question is put to `CycleRef` rather than answered again here: the
   * generator clamps a day onto a short month's last day, and a second,
   * stricter rule in this file is exactly the bug FIN-93 fixed.
   *
   * The draft still refuses; validation belongs here and a value object does
   * not negotiate. What it does not do is refuse blind — the offer travels
   * with the refusal, and a caller that comes back having had it accepted
   * gets the fallback dates for those cycles alone (FIN-117).
   */
  private placeOrOffer(
    name: string,
    dueDayOfMonth: number,
    anchor: PaydayAnchor,
    accepted: boolean,
  ): DueDateOverride[] {
    const window = CycleRef.rolling(
      this.state.startMonth,
      ROLLING_CYCLES,
      anchor,
      this.state.holidays,
    );

    const unreachable = window
      .filter((ref) => ref.dateForDayOfMonth(dueDayOfMonth) === undefined)
      .map((ref): UnreachableCycle => ({
        month: ref.month,
        label: ref.label,
        range: ref.range.toString(),
        fallbackDate: ref.end,
        fallbackDayOfMonth: ref.end.day,
      }));

    const [first, ...rest] = unreachable;
    if (first !== undefined && !accepted) {
      throw new DueDayOutsideCycle(
        offerFallback(name, dueDayOfMonth, first, rest.length),
        dueDayOfMonth,
        unreachable,
      );
    }

    return unreachable.map((cycle) => ({
      month: cycle.month,
      date: cycle.fallbackDate,
    }));
  }

  private readBucketName(id: string, proposed: ProposedBucket): string {
    const name = requireUnusedName(
      BUCKET,
      proposed.name,
      namesOthersHold(this.state.buckets, id),
    );
    requireRuleAsksForSomething(name, proposed.rule);
    this.requireUnusedPriority(id, name, proposed.priority);

    return name;
  }

  private requireUnusedPriority(
    id: string,
    name: string,
    priority: number,
  ): void {
    if (!Number.isSafeInteger(priority) || priority < 1) {
      throw new InvalidSetupRecord(
        `A prioridade é um número inteiro de pelo menos 1; recebido ${String(priority)}.`,
      );
    }
    const taken = this.state.buckets.find(
      (bucket) => bucket.id !== id && bucket.priority === priority,
    );
    if (taken !== undefined) {
      throw new InvalidSetupRecord(
        `${name} não pode ser a #${String(priority)}; ${taken.name} já é, e a ordem decide quem recebe quando o dinheiro não dá para todas.`,
      );
    }
  }

  private with(changes: Partial<DraftState>): SetupDraft {
    return new SetupDraft({ ...this.state, ...changes });
  }
}

/**
 * The refusal as an offer: what cannot be placed, and the cycle's own last day
 * standing in for it — never a different due day, which would be a lie about
 * the bill (UC-1.7, FIN-117).
 */
function offerFallback(
  name: string,
  dueDayOfMonth: number,
  first: UnreachableCycle,
  others: number,
): string {
  const day = String(dueDayOfMonth);
  const cycles =
    others === 0
      ? `o ciclo de ${first.label} (${first.range}) nunca alcança`
      : `o ciclo de ${first.label} (${first.range}) e outros ${String(others)} ciclos nunca alcançam`;
  const offer =
    others === 0
      ? `Posso usar o último dia desse ciclo, ${first.fallbackDate.toISO()}`
      : `Posso usar o último dia de cada um desses ciclos, a começar por ${first.fallbackDate.toISO()}`;

  return `${name} vence no dia ${day}, que ${cycles}. ${offer}, e manter o dia ${day} em todos os outros.`;
}

/** What everything but the record being written holds, so a correction may
 * keep the name it already has. */
function namesOthersHold(
  held: readonly { id: string; name: string }[],
  id: string,
): string[] {
  return held.filter((record) => record.id !== id).map((record) => record.name);
}

function existing<T extends { id: string }>(
  held: readonly T[],
  id: string,
  what: RecordNoun,
): T {
  const found = held.find((record) => record.id === id);
  if (found === undefined) {
    throw new SetupRecordNotFound(
      `A configuração não tem ${none(what)} com este id: "${id}".`,
    );
  }
  return found;
}

function replacing<T extends { id: string }>(held: readonly T[], next: T): T[] {
  return held.map((record) => (record.id === next.id ? next : record));
}

function without<T extends { id: string }>(
  held: readonly T[],
  id: string,
): T[] {
  return held.filter((record) => record.id !== id);
}

/**
 * What a record is called on screen, with the gender Portuguese needs to
 * agree with it: `uma conta` against `um cartão`.
 */
interface RecordNoun {
  readonly word: string;
  readonly isFeminine: boolean;
}

const ACCOUNT: RecordNoun = { word: 'conta', isFeminine: true };
const BILL: RecordNoun = { word: 'conta a pagar', isFeminine: true };
const FIXED_BILL: RecordNoun = { word: 'conta fixa', isFeminine: true };
const VARIABLE_BILL: RecordNoun = { word: 'conta variável', isFeminine: true };
const BUCKET: RecordNoun = { word: 'caixinha', isFeminine: true };

function one(noun: RecordNoun): string {
  return `${noun.isFeminine ? 'uma' : 'um'} ${noun.word}`;
}

function none(noun: RecordNoun): string {
  return `${noun.isFeminine ? 'nenhuma' : 'nenhum'} ${noun.word}`;
}

function requireUnusedName(
  what: RecordNoun,
  name: string,
  taken: readonly string[],
): string {
  const trimmed = name.trim();
  if (trimmed === '') {
    throw new InvalidSetupRecord(
      `${what.isFeminine ? 'Toda' : 'Todo'} ${what.word} precisa de um nome.`,
    );
  }
  if (taken.some((used) => used.toLowerCase() === trimmed.toLowerCase())) {
    throw new InvalidSetupRecord(
      `Já existe ${one(what)} com o nome "${trimmed}".`,
    );
  }
  return trimmed;
}

function requireDayOfMonth(what: string, day: number): void {
  if (!Number.isSafeInteger(day) || day < 1 || day > 31) {
    throw new InvalidSetupRecord(
      `O dia de ${what} é um dia do mês; recebido ${String(day)}.`,
    );
  }
}

function requirePositive(what: string, amount: Money): Money {
  if (!amount.isPositive()) {
    throw new InvalidSetupRecord(
      `${what} tem de ser maior que zero; recebido R$ ${amount.toReais()}.`,
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
      `${name} precisa de uma regra de alocação que coloque algo nela a cada ciclo.`,
    );
  }
}
