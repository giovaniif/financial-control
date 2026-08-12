import type { Account } from '../../domain/budgeting/account.js';
import type { CycleRef } from '../../domain/budgeting/cycle-ref.js';
import { PaydayAnchor, ShiftPolicy } from '../../domain/budgeting/cycle-ref.js';
import type { Cycle } from '../../domain/budgeting/cycle.js';
import type { RecurringTemplate } from '../../domain/budgeting/recurring-template.js';
import type { Card } from '../../domain/cards/card.js';
import type { Bucket } from '../../domain/goals/bucket.js';
import type {
  AccountRepository,
  CycleRepository,
  BucketRepository,
  CardRepository,
  RecurringTemplateRepository,
  SettingsRepository,
} from '../../domain/ports/repositories.js';
import type {
  SpreadsheetReader,
  Workbook,
} from '../../domain/ports/spreadsheet-reader.js';

/**
 * In-memory doubles of the repository ports.
 *
 * Fakes rather than mocks: they implement the port, so an interactor test
 * exercises the real orchestration instead of asserting on calls that a
 * refactor would invalidate.
 */
export class InMemoryAccountRepository implements AccountRepository {
  private readonly rows = new Map<string, Account>();

  constructor(seed: readonly Account[] = []) {
    for (const account of seed) {
      this.rows.set(account.id, account);
    }
  }

  findAll(): Promise<Account[]> {
    return Promise.resolve([...this.rows.values()]);
  }

  findById(id: string): Promise<Account | undefined> {
    return Promise.resolve(this.rows.get(id));
  }

  save(account: Account): Promise<void> {
    this.rows.set(account.id, account);
    return Promise.resolve();
  }

  delete(id: string): Promise<void> {
    this.rows.delete(id);
    return Promise.resolve();
  }

  deleteAll(): Promise<void> {
    this.rows.clear();
    return Promise.resolve();
  }
}

export class InMemoryCycleRepository implements CycleRepository {
  private readonly rows = new Map<string, Cycle>();

  constructor(seed: readonly Cycle[] = []) {
    for (const cycle of seed) {
      this.rows.set(cycle.ref.month, cycle);
    }
  }

  findByMonth(ref: CycleRef): Promise<Cycle | undefined> {
    return Promise.resolve(this.rows.get(ref.month));
  }

  monthsBefore(month: string): Promise<readonly string[]> {
    return Promise.resolve(
      [...this.rows.keys()].filter((stored) => stored < month).sort(),
    );
  }

  allMonths(): Promise<readonly string[]> {
    return Promise.resolve([...this.rows.keys()].sort());
  }

  save(cycle: Cycle): Promise<void> {
    this.rows.set(cycle.ref.month, cycle);
    return Promise.resolve();
  }

  deleteAll(): Promise<void> {
    this.rows.clear();
    return Promise.resolve();
  }

  get saved(): Cycle[] {
    return [...this.rows.values()];
  }
}

/**
 * Hands back a prepared workbook whatever bytes it is given. The xlsx parsing
 * itself is infrastructure's problem and is tested there; an interactor test
 * only cares what the grid says.
 */
export class InMemorySpreadsheetReader implements SpreadsheetReader {
  constructor(private readonly workbook: Workbook) {}

  read(): Workbook {
    return this.workbook;
  }
}

export class InMemorySettingsRepository implements SettingsRepository {
  private configured = false;

  constructor(private anchor = PaydayAnchor.of(5, ShiftPolicy.Preceding)) {}

  load(): Promise<PaydayAnchor> {
    return Promise.resolve(this.anchor);
  }

  isConfigured(): Promise<boolean> {
    return Promise.resolve(this.configured);
  }

  save(anchor: PaydayAnchor): Promise<void> {
    this.anchor = anchor;
    this.configured = true;
    return Promise.resolve();
  }
}

export class InMemoryTemplateRepository implements RecurringTemplateRepository {
  private readonly rows = new Map<string, RecurringTemplate>();

  constructor(seed: readonly RecurringTemplate[] = []) {
    for (const template of seed) {
      this.rows.set(template.id, template);
    }
  }

  findAll(): Promise<RecurringTemplate[]> {
    return Promise.resolve([...this.rows.values()]);
  }

  findById(id: string): Promise<RecurringTemplate | undefined> {
    return Promise.resolve(this.rows.get(id));
  }

  save(template: RecurringTemplate): Promise<void> {
    this.rows.set(template.id, template);
    return Promise.resolve();
  }

  delete(id: string): Promise<void> {
    this.rows.delete(id);
    return Promise.resolve();
  }

  deleteAll(): Promise<void> {
    this.rows.clear();
    return Promise.resolve();
  }
}

export class InMemoryCardRepository implements CardRepository {
  private readonly rows = new Map<string, Card>();

  constructor(seed: readonly Card[] = []) {
    for (const card of seed) {
      this.rows.set(card.id, card);
    }
  }

  findAll(): Promise<Card[]> {
    return Promise.resolve([...this.rows.values()]);
  }

  findById(id: string): Promise<Card | undefined> {
    return Promise.resolve(this.rows.get(id));
  }

  save(card: Card): Promise<void> {
    this.rows.set(card.id, card);
    return Promise.resolve();
  }

  delete(id: string): Promise<void> {
    this.rows.delete(id);
    return Promise.resolve();
  }

  deleteAll(): Promise<void> {
    this.rows.clear();
    return Promise.resolve();
  }
}

export class InMemoryBucketRepository implements BucketRepository {
  private readonly rows = new Map<string, Bucket>();

  constructor(seed: readonly Bucket[] = []) {
    for (const bucket of seed) {
      this.rows.set(bucket.id, bucket);
    }
  }

  findAll(): Promise<Bucket[]> {
    return Promise.resolve([...this.rows.values()]);
  }

  findById(id: string): Promise<Bucket | undefined> {
    return Promise.resolve(this.rows.get(id));
  }

  save(bucket: Bucket): Promise<void> {
    this.rows.set(bucket.id, bucket);
    return Promise.resolve();
  }

  delete(id: string): Promise<void> {
    this.rows.delete(id);
    return Promise.resolve();
  }

  deleteAll(): Promise<void> {
    this.rows.clear();
    return Promise.resolve();
  }
}
