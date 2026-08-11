import type { Account } from '../../domain/budgeting/account.js';
import type { CycleRef } from '../../domain/budgeting/cycle-ref.js';
import { PaydayAnchor, ShiftPolicy } from '../../domain/budgeting/cycle-ref.js';
import type { Cycle } from '../../domain/budgeting/cycle.js';
import type { RecurringTemplate } from '../../domain/budgeting/recurring-template.js';
import type {
  AccountRepository,
  CycleRepository,
  RecurringTemplateRepository,
  SettingsRepository,
} from '../../domain/ports/repositories.js';

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

  save(cycle: Cycle): Promise<void> {
    this.rows.set(cycle.ref.month, cycle);
    return Promise.resolve();
  }

  get saved(): Cycle[] {
    return [...this.rows.values()];
  }
}

export class InMemorySettingsRepository implements SettingsRepository {
  constructor(private anchor = PaydayAnchor.of(5, ShiftPolicy.Preceding)) {}

  load(): Promise<PaydayAnchor> {
    return Promise.resolve(this.anchor);
  }

  save(anchor: PaydayAnchor): Promise<void> {
    this.anchor = anchor;
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
}
