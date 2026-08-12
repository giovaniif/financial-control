import type {
  AnchorChangePreviewResponse,
  AnchorResolveResponse,
  AnchorSettingsResponse,
} from '@fin/contracts';
import { describe, expect, it } from 'vitest';

import { ConfigurePaydayAnchor } from '../../../application/budgeting/uc-1-1-configure-payday-anchor.js';
import {
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
} from '../../../domain/budgeting/ledger-entry.js';
import { noHolidays } from '../../../domain/ports/holiday-calendar.js';
import { LocalDate } from '../../../domain/shared/local-date.js';
import { Money } from '../../../domain/shared/money.js';
import { buildTestServer } from '../testing/test-server.js';

const anchorFive = PaydayAnchor.of(5, ShiftPolicy.Preceding);
const clock = FixedClock.at('2026-08-10T12:00:00Z');

const serverWith = (cycles: InMemoryCycleRepository) =>
  buildTestServer({
    clock,
    configureAnchor: new ConfigurePaydayAnchor(
      new InMemorySettingsRepository(anchorFive),
      cycles,
      noHolidays,
      clock,
    ),
  });

const augustWith = (...dueDates: string[]) =>
  Cycle.open({
    id: 'cycle-sep',
    ref: CycleRef.forMonth('2026-09', anchorFive, noHolidays),
    openingBalance: Money.zero(),
    entries: dueDates.map((due, i) =>
      LedgerEntry.create({
        id: `e${String(i)}`,
        description: `Entry ${String(i)}`,
        kind: EntryKind.Fixed,
        dueDate: LocalDate.parse(due),
        planned: Money.fromCents(-10_000),
      }),
    ),
  });

describe('GET /settings/anchor', () => {
  it('reports the configured anchor', async () => {
    const response = await serverWith(new InMemoryCycleRepository()).inject({
      method: 'GET',
      url: '/settings/anchor',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<AnchorSettingsResponse>()).toEqual({
      anchorDay: 5,
      shiftPolicy: 'PRECEDING',
    });
  });
});

describe('POST /settings/anchor/preview', () => {
  it('describes what a change would do', async () => {
    const app = serverWith(
      new InMemoryCycleRepository([augustWith('2026-08-20')]),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/settings/anchor/preview',
      payload: { anchorDay: 10, shiftPolicy: 'PRECEDING' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<AnchorChangePreviewResponse>().proposed).toEqual({
      anchorDay: 10,
      shiftPolicy: 'PRECEDING',
    });
  });

  it.each([
    ['a missing body', {}],
    ['a non-numeric day', { anchorDay: 'five', shiftPolicy: 'PRECEDING' }],
    ['an unknown policy', { anchorDay: 5, shiftPolicy: 'SIDEWAYS' }],
  ])('answers 400 to %s', async (_name, payload) => {
    const app = serverWith(new InMemoryCycleRepository());

    const response = await app.inject({
      method: 'POST',
      url: '/settings/anchor/preview',
      payload,
    });

    expect(response.statusCode).toBe(400);
  });

  it('answers 400 to a day that is not a day of the month', async () => {
    const app = serverWith(new InMemoryCycleRepository());

    const response = await app.inject({
      method: 'POST',
      url: '/settings/anchor/preview',
      payload: { anchorDay: 32, shiftPolicy: 'PRECEDING' },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('PUT /settings/anchor', () => {
  it('applies a change that re-homes cleanly', async () => {
    const app = serverWith(
      new InMemoryCycleRepository([augustWith('2026-08-20')]),
    );

    const response = await app.inject({
      method: 'PUT',
      url: '/settings/anchor',
      payload: { anchorDay: 10, shiftPolicy: 'PRECEDING' },
    });

    expect(response.statusCode).toBe(200);
  });

  // The request is valid; the stored data just cannot accommodate it.
  it('answers 409 when the change would orphan an entry', async () => {
    const app = serverWith(
      new InMemoryCycleRepository([augustWith('2026-08-06', '2026-08-20')]),
    );

    const response = await app.inject({
      method: 'PUT',
      url: '/settings/anchor',
      payload: { anchorDay: 10, shiftPolicy: 'PRECEDING' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json<{ orphanedEntries: number }>().orphanedEntries).toBe(
      1,
    );
  });

  it('answers 400 to a malformed body', async () => {
    const app = serverWith(new InMemoryCycleRepository());

    const response = await app.inject({
      method: 'PUT',
      url: '/settings/anchor',
      payload: { anchorDay: 5 },
    });

    expect(response.statusCode).toBe(400);
  });

  // The first run has to show what an anchor day means before anyone commits
  // to it, on an app where nothing has been configured yet.
  describe('POST /settings/anchor/resolve', () => {
    it('resolves the coming cycles without saving the anchor', async () => {
      const app = buildTestServer();

      const response = await app.inject({
        method: 'POST',
        url: '/settings/anchor/resolve',
        payload: { anchorDay: 5, shiftPolicy: 'PRECEDING' },
      });

      expect(response.statusCode).toBe(200);
      const { cycles } = response.json<AnchorResolveResponse>();
      expect(cycles).toHaveLength(12);
      expect(cycles[0]).toEqual({
        month: '2026-09',
        label: 'September 2026',
        start: '2026-08-05',
        end: '2026-09-03',
        shifted: false,
        clamped: false,
      });

      const stored = await app.inject({
        method: 'GET',
        url: '/settings/anchor',
      });
      expect(stored.json<AnchorSettingsResponse>().anchorDay).toBe(5);
    });

    it('rejects a body that is not an anchor', async () => {
      const app = buildTestServer();

      const response = await app.inject({
        method: 'POST',
        url: '/settings/anchor/resolve',
        payload: { anchorDay: 5 },
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects an anchor day outside the month', async () => {
      const app = buildTestServer();

      const response = await app.inject({
        method: 'POST',
        url: '/settings/anchor/resolve',
        payload: { anchorDay: 32, shiftPolicy: 'PRECEDING' },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
