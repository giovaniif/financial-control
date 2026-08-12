import { describe, expect, it } from 'vitest';

import { Account } from '../../domain/budgeting/account.js';
import { PaydayAnchor, ShiftPolicy } from '../../domain/budgeting/cycle-ref.js';
import { Money } from '../../domain/shared/money.js';
import {
  InMemoryAccountRepository,
  InMemoryBucketRepository,
  InMemoryCardRepository,
  InMemorySettingsRepository,
  InMemoryTemplateRepository,
} from '../testing/fakes.js';
import { ReadSetupState } from './uc-1-5-read-setup-state.js';

function build({
  anchorConfigured = false,
  accounts = new InMemoryAccountRepository(),
  templates = new InMemoryTemplateRepository(),
  cards = new InMemoryCardRepository(),
  buckets = new InMemoryBucketRepository(),
}: {
  anchorConfigured?: boolean;
  accounts?: InMemoryAccountRepository;
  templates?: InMemoryTemplateRepository;
  cards?: InMemoryCardRepository;
  buckets?: InMemoryBucketRepository;
} = {}) {
  const settings = new InMemorySettingsRepository();
  if (anchorConfigured) {
    void settings.save(PaydayAnchor.of(5, ShiftPolicy.Preceding));
  }
  return new ReadSetupState(settings, accounts, templates, cards, buckets);
}

function account(name: string): Account {
  return Account.open({
    id: `acc-${name}`,
    name,
    type: 'CHECKING',
    balance: Money.fromCents(1000),
  });
}

describe('ReadSetupState', () => {
  it('reports an untouched app as pristine', async () => {
    const state = await build().execute();

    expect(state).toEqual({
      anchorConfigured: false,
      accounts: 0,
      cards: 0,
      templates: 0,
      buckets: 0,
      isPristine: true,
    });
  });

  // The anchor repository hands back a default when nothing is stored, so the
  // value alone can never distinguish "configured to day 5" from "never set".
  it('stops being pristine once the anchor has been configured', async () => {
    const state = await build({ anchorConfigured: true }).execute();

    expect(state.anchorConfigured).toBe(true);
    expect(state.isPristine).toBe(false);
  });

  it('stops being pristine once any data exists', async () => {
    const accounts = new InMemoryAccountRepository([account('Checking')]);

    const state = await build({ accounts }).execute();

    expect(state.accounts).toBe(1);
    expect(state.isPristine).toBe(false);
  });

  it('counts what each first-run step has produced', async () => {
    const accounts = new InMemoryAccountRepository([
      account('Checking'),
      account('Savings'),
    ]);

    const state = await build({ anchorConfigured: true, accounts }).execute();

    expect(state).toEqual({
      anchorConfigured: true,
      accounts: 2,
      cards: 0,
      templates: 0,
      buckets: 0,
      isPristine: false,
    });
  });
});
