import type { ReopenPreviewResponse } from '@fin/contracts';
import { describe, expect, it } from 'vitest';

import { CloseCycle } from '../../../application/budgeting/uc-3-8-close-cycle.js';
import { LedgerActions } from '../../../application/budgeting/uc-3-ledger-actions.js';
import {
  InMemoryAccountRepository,
  InMemoryCycleRepository,
  InMemorySettingsRepository,
} from '../../../application/testing/fakes.js';
import { FixedClock } from '../../../application/testing/fixed-clock.js';
import {
  CycleRef,
  PaydayAnchor,
  ShiftPolicy,
} from '../../../domain/budgeting/cycle-ref.js';
import { Cycle } from '../../../domain/budgeting/cycle.js';
import {
  EntryKind,
  LedgerEntry,
  Origin,
} from '../../../domain/budgeting/ledger-entry.js';
import { noHolidays } from '../../../domain/ports/holiday-calendar.js';
import { LocalDate } from '../../../domain/shared/local-date.js';
import { Money } from '../../../domain/shared/money.js';
import { buildTestServer } from '../testing/test-server.js';

const anchor = PaydayAnchor.of(5, ShiftPolicy.Preceding);
const august = CycleRef.forMonth('2026-09', anchor, noHolidays);
const afterAugust = FixedClock.at('2026-09-20T12:00:00Z');

const populated = () =>
  Cycle.open({
    id: 'cycle-sep',
    ref: august,
    openingBalance: Money.zero(),
    entries: [
      LedgerEntry.create({
        id: 'e-health',
        description: 'Health Plan',
        kind: EntryKind.Fixed,
        dueDate: LocalDate.parse('2026-08-08'),
        planned: Money.fromCents(-32_000),
        origin: Origin.fromTemplate('tpl-health'),
      }),
    ],
  });

const serverWith = (...cycles: Cycle[]) => {
  const repository = new InMemoryCycleRepository(cycles);
  const settings = new InMemorySettingsRepository(anchor);

  return {
    repository,
    app: buildTestServer({
      ledgerActions: new LedgerActions(
        repository,
        settings,
        noHolidays,
        () => 'new-entry',
      ),
      closeCycle: new CloseCycle(
        repository,
        settings,
        new InMemoryAccountRepository(),
        noHolidays,
        afterAugust,
      ),
    }),
  };
};

describe('POST /cycles/:month/entries', () => {
  it('answers 201 with the id it created', async () => {
    const { app } = serverWith(populated());

    const response = await app.inject({
      method: 'POST',
      url: '/cycles/2026-09/entries',
      payload: {
        description: 'Dinner split',
        kind: 'VARIABLE',
        dueDate: '2026-08-14',
        amount: 12_000,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json<{ id: string }>().id).toBe('new-entry');
  });

  it('answers 400 to a due date outside the cycle', async () => {
    const { app } = serverWith(populated());

    const response = await app.inject({
      method: 'POST',
      url: '/cycles/2026-09/entries',
      payload: {
        description: 'Too late',
        kind: 'VARIABLE',
        dueDate: '2026-09-20',
        amount: 1_000,
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it.each([
    ['a missing body', {}],
    [
      'an unknown kind',
      { description: 'X', kind: 'MYSTERY', dueDate: '2026-08-14', amount: 1 },
    ],
    [
      'a malformed date',
      { description: 'X', kind: 'VARIABLE', dueDate: '14/08/2026', amount: 1 },
    ],
  ])('answers 400 to %s', async (_name, payload) => {
    const { app } = serverWith(populated());

    const response = await app.inject({
      method: 'POST',
      url: '/cycles/2026-09/entries',
      payload,
    });

    expect(response.statusCode).toBe(400);
  });

  it('answers 404 for a cycle never materialised', async () => {
    const { app } = serverWith();

    const response = await app.inject({
      method: 'POST',
      url: '/cycles/2026-09/entries',
      payload: {
        description: 'X',
        kind: 'VARIABLE',
        dueDate: '2026-08-14',
        amount: 1,
      },
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('POST /cycles/:month/entries/:id/settle', () => {
  it('settles at the planned amount when none is given', async () => {
    const { app, repository } = serverWith(populated());

    const response = await app.inject({
      method: 'POST',
      url: '/cycles/2026-09/entries/e-health/settle',
      payload: { status: 'PAID' },
    });

    expect(response.statusCode).toBe(204);
    const entry = (await repository.findByMonth(august))?.entries[0];
    expect(entry?.amount.actual?.cents).toBe(-32_000);
  });

  it('records an actual amount that differs', async () => {
    const { app, repository } = serverWith(populated());

    await app.inject({
      method: 'POST',
      url: '/cycles/2026-09/entries/e-health/settle',
      payload: { status: 'PAID', actual: -33_016 },
    });

    const entry = (await repository.findByMonth(august))?.entries[0];
    expect(entry?.amount.variance?.cents).toBe(-1_016);
  });

  it('skips', async () => {
    const { app, repository } = serverWith(populated());

    await app.inject({
      method: 'POST',
      url: '/cycles/2026-09/entries/e-health/settle',
      payload: { status: 'SKIPPED' },
    });

    expect(
      (await repository.findByMonth(august))?.entries[0]?.realised.isZero(),
    ).toBe(true);
  });

  it('answers 400 to an unknown status', async () => {
    const { app } = serverWith(populated());

    const response = await app.inject({
      method: 'POST',
      url: '/cycles/2026-09/entries/e-health/settle',
      payload: { status: 'MAYBE' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('answers 404 for an entry that is not there', async () => {
    const { app } = serverWith(populated());

    const response = await app.inject({
      method: 'POST',
      url: '/cycles/2026-09/entries/missing/settle',
      payload: { status: 'PAID' },
    });

    expect(response.statusCode).toBe(404);
  });

  // The request is well formed; the state just does not allow it.
  it('answers 409 when the entry is already settled', async () => {
    const { app } = serverWith(populated());

    await app.inject({
      method: 'POST',
      url: '/cycles/2026-09/entries/e-health/settle',
      payload: { status: 'PAID' },
    });
    const again = await app.inject({
      method: 'POST',
      url: '/cycles/2026-09/entries/e-health/settle',
      payload: { status: 'PAID' },
    });

    expect(again.statusCode).toBe(409);
  });
});

describe('overriding over the API', () => {
  it('sets and reverts one cycle figure', async () => {
    const { app, repository } = serverWith(populated());

    await app.inject({
      method: 'PUT',
      url: '/cycles/2026-09/entries/e-health/override',
      payload: { amount: -45_000 },
    });
    expect(
      (await repository.findByMonth(august))?.entries[0]?.amount.planned.cents,
    ).toBe(-45_000);

    await app.inject({
      method: 'DELETE',
      url: '/cycles/2026-09/entries/e-health/override',
    });
    expect(
      (await repository.findByMonth(august))?.entries[0]?.amount.planned.cents,
    ).toBe(-32_000);
  });

  it('answers 400 without an amount', async () => {
    const { app } = serverWith(populated());

    const response = await app.inject({
      method: 'PUT',
      url: '/cycles/2026-09/entries/e-health/override',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('closing and reopening over the API', () => {
  it('answers 409 while an entry is unsettled', async () => {
    const { app } = serverWith(populated());

    const response = await app.inject({
      method: 'POST',
      url: '/cycles/2026-09/close',
    });

    expect(response.statusCode).toBe(409);
  });

  it('closes once everything is settled', async () => {
    const { app } = serverWith(populated().skipEntry('e-health'));

    const response = await app.inject({
      method: 'POST',
      url: '/cycles/2026-09/close',
    });

    expect(response.statusCode).toBe(204);
  });

  it('refuses every write once closed', async () => {
    const { app } = serverWith(populated().skipEntry('e-health').close());

    const response = await app.inject({
      method: 'PUT',
      url: '/cycles/2026-09/entries/e-health/override',
      payload: { amount: -1 },
    });

    expect(response.statusCode).toBe(409);
  });

  it('previews a reopen without changing anything', async () => {
    const { app } = serverWith(populated().skipEntry('e-health').close());

    const response = await app.inject({
      method: 'GET',
      url: '/cycles/2026-09/reopen-preview',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<ReopenPreviewResponse>().month).toBe('2026-09');
  });

  it('reopens and reports what moved', async () => {
    const { app, repository } = serverWith(
      populated().skipEntry('e-health').close(),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/cycles/2026-09/reopen',
    });

    expect(response.statusCode).toBe(200);
    expect((await repository.findByMonth(august))?.isClosed).toBe(false);
  });
});
