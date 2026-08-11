import type { Account } from '../budgeting/account.js';
import type { CycleRef, PaydayAnchor } from '../budgeting/cycle-ref.js';
import type { Cycle } from '../budgeting/cycle.js';
import type { RecurringTemplate } from '../budgeting/recurring-template.js';

/**
 * Repositories take and return domain objects, never persistence models. The
 * mapping lives in infrastructure, so nothing above it knows a database exists.
 */
export interface AccountRepository {
  findAll(): Promise<Account[]>;
  findById(id: string): Promise<Account | undefined>;
  save(account: Account): Promise<void>;
  delete(id: string): Promise<void>;
}

/**
 * A cycle is loaded against an already-resolved {@link CycleRef}: the anchor
 * rules belong to the domain, not to a query. The repository only hydrates
 * what is stored against that month.
 */
export interface CycleRepository {
  findByMonth(ref: CycleRef): Promise<Cycle | undefined>;
  save(cycle: Cycle): Promise<void>;
}

export interface SettingsRepository {
  /** The configured payday anchor, or the default when none is stored yet. */
  load(): Promise<PaydayAnchor>;
  save(anchor: PaydayAnchor): Promise<void>;
}

export interface RecurringTemplateRepository {
  findAll(): Promise<RecurringTemplate[]>;
  findById(id: string): Promise<RecurringTemplate | undefined>;
  save(template: RecurringTemplate): Promise<void>;
  delete(id: string): Promise<void>;
}
