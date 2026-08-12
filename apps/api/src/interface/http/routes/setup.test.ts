import type { SetupStateResponse } from '@fin/contracts';
import { describe, expect, it } from 'vitest';

import { ReadSetupState } from '../../../application/projection/uc-1-5-read-setup-state.js';
import { Account } from '../../../domain/budgeting/account.js';
import { Money } from '../../../domain/shared/money.js';
import {
  InMemoryAccountRepository,
  InMemoryBucketRepository,
  InMemoryCardRepository,
  InMemorySettingsRepository,
  InMemoryTemplateRepository,
} from '../../../application/testing/fakes.js';
import { buildTestServer } from '../testing/test-server.js';

function readSetupState(accounts: InMemoryAccountRepository): ReadSetupState {
  return new ReadSetupState(
    new InMemorySettingsRepository(),
    accounts,
    new InMemoryTemplateRepository(),
    new InMemoryCardRepository(),
    new InMemoryBucketRepository(),
  );
}

describe('GET /setup', () => {
  it('reports an untouched app as pristine', async () => {
    const app = buildTestServer();

    const response = await app.inject({ method: 'GET', url: '/setup' });

    expect(response.statusCode).toBe(200);
    expect(response.json<SetupStateResponse>()).toEqual({
      anchorConfigured: false,
      accounts: 0,
      cards: 0,
      templates: 0,
      buckets: 0,
      isPristine: true,
    });
  });

  it('reports an app that already holds data as not pristine', async () => {
    const accounts = new InMemoryAccountRepository([
      Account.open({
        id: 'acc-1',
        name: 'Checking',
        type: 'CHECKING',
        balance: Money.fromCents(216_000),
      }),
    ]);
    const app = buildTestServer({ readSetupState: readSetupState(accounts) });

    const response = await app.inject({ method: 'GET', url: '/setup' });

    expect(response.json<SetupStateResponse>()).toMatchObject({
      accounts: 1,
      isPristine: false,
    });
  });
});
