import type { CycleResponse, CycleWindowResponse } from '@fin/contracts';
import { describe, expect, it } from 'vitest';

import { ReadCycle } from '../../../application/budgeting/uc-3-1-read-cycle.js';
import { ListCycles } from '../../../application/budgeting/uc-3-3-list-cycles.js';
import {
  InMemoryAccountRepository,
  InMemoryCycleRepository,
  InMemorySettingsRepository,
  InMemoryTemplateRepository,
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

const anchor = PaydayAnchor.of(5, ShiftPolicy.Preceding);
const august = CycleRef.forMonth('2026-09', anchor, noHolidays);

const entry = (
  id: string,
  kind: EntryKind,
  due: string,
  reais: number,
  isEstimate = false,
) =>
  LedgerEntry.create({
    id,
    description: id,
    kind,
    dueDate: LocalDate.parse(due),
    planned: Money.fromCents(reais * 100),
    isEstimate,
  });

const populated = () =>
  Cycle.open({
    id: 'cycle-sep',
    ref: august,
    openingBalance: Money.zero(),
    entries: [
      entry('Salary', EntryKind.Income, '2026-08-05', 18_000),
      entry('Rent', EntryKind.Fixed, '2026-08-10', -7_610),
      entry('Contractor Costs', EntryKind.Fixed, '2026-08-25', -1_500, true),
    ],
  });

const serverWith = (...cycles: Cycle[]) => {
  const repository = new InMemoryCycleRepository(cycles);

  return buildTestServer({
    readCycle: new ReadCycle(
      repository,
      new InMemorySettingsRepository(anchor),
      noHolidays,
      new InMemoryTemplateRepository(),
    ),
  });
};

describe('GET /cycles/:month', () => {
  it('reports the chain, the entries and the running balance', async () => {
    const response = await serverWith(populated()).inject({
      method: 'GET',
      url: '/cycles/2026-09',
    });
    const body = response.json<CycleResponse>();

    expect(response.statusCode).toBe(200);
    expect(body.chain.netSurplus).toBe(889_000);
    expect(body.entries).toHaveLength(3);
    expect(body.entries.at(-1)?.balance).toBe(889_000);
  });

  it('states the cycle bounds, never a bare month name', async () => {
    const body = (
      await serverWith(populated()).inject({
        method: 'GET',
        url: '/cycles/2026-09',
      })
    ).json<CycleResponse>();

    expect(body.label).toBe('Setembro de 2026');
    expect(body.start).toBe('2026-08-05');
    expect(body.end).toBe('2026-09-03');
  });

  // The global toggle is a query parameter, not a second endpoint.
  it('answers the same cycle without the unconfirmed estimate', async () => {
    const body = (
      await serverWith(populated()).inject({
        method: 'GET',
        url: '/cycles/2026-09?estimates=excluded',
      })
    ).json<CycleResponse>();

    expect(body.estimates).toBe('excluded');
    expect(body.entries).toHaveLength(2);
    expect(body.chain.netSurplus).toBe(1_039_000);
  });

  it('reports where the balance bottoms out', async () => {
    const dipping = Cycle.open({
      id: 'cycle-sep',
      ref: august,
      openingBalance: Money.fromCents(50_000),
      entries: [
        entry('Big bill', EntryKind.Fixed, '2026-08-10', -12_000),
        entry('Salary', EntryKind.Income, '2026-08-25', 18_000),
      ],
    });

    const body = (
      await serverWith(dipping).inject({
        method: 'GET',
        url: '/cycles/2026-09',
      })
    ).json<CycleResponse>();

    expect(body.lowWaterMark?.balance).toBe(-1_150_000);
    expect(body.firstNegativeDate).toBe('2026-08-10');
  });

  it('reports no negative date when the balance never crosses zero', async () => {
    const body = (
      await serverWith(populated()).inject({
        method: 'GET',
        url: '/cycles/2026-09',
      })
    ).json<CycleResponse>();

    expect(body.firstNegativeDate).toBeNull();
  });

  // The month exists; nothing has been put in it yet.
  it('answers a well-formed empty cycle for a month never materialised', async () => {
    const response = await serverWith().inject({
      method: 'GET',
      url: '/cycles/2026-12',
    });
    const body = response.json<CycleResponse>();

    expect(response.statusCode).toBe(200);
    expect(body.entries).toEqual([]);
    expect(body.chain.closingBalance).toBe(0);
    expect(body.lowWaterMark).toBeNull();
  });

  it.each([
    ['a month it cannot parse', '/cycles/August-2026'],
    ['a month out of range', '/cycles/2026-13'],
  ])('answers 400 to %s', async (_name, url) => {
    expect((await serverWith().inject({ method: 'GET', url })).statusCode).toBe(
      400,
    );
  });

  it('answers 400 to an unknown estimates mode', async () => {
    const response = await serverWith().inject({
      method: 'GET',
      url: '/cycles/2026-09?estimates=maybe',
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('GET /cycles', () => {
  const windowServer = (...cycles: Cycle[]) => {
    const repository = new InMemoryCycleRepository(cycles);
    const settings = new InMemorySettingsRepository(anchor);
    const accounts = new InMemoryAccountRepository();

    return buildTestServer({
      listCycles: new ListCycles(
        repository,
        settings,
        accounts,
        noHolidays,
        FixedClock.at('2026-08-10T12:00:00Z'),
        new InMemoryTemplateRepository(),
      ),
    });
  };

  it('answers the twelve cycles the header navigates', async () => {
    const response = await windowServer().inject({
      method: 'GET',
      url: '/cycles',
    });
    const body = response.json<CycleWindowResponse>();

    expect(response.statusCode).toBe(200);
    expect(body.cycles).toHaveLength(12);
    expect(body.cycles[0]?.month).toBe('2026-09');
  });

  it('tags exactly one cycle current, and the one after it next', async () => {
    const body = (
      await windowServer().inject({ method: 'GET', url: '/cycles' })
    ).json<CycleWindowResponse>();

    expect(body.cycles.filter((c) => c.position === 'current')).toHaveLength(1);
    expect(body.cycles[1]?.position).toBe('next');
  });

  it('chains the closing balance into the next opening balance', async () => {
    const body = (
      await windowServer(populated()).inject({
        method: 'GET',
        url: '/cycles',
      })
    ).json<CycleWindowResponse>();

    expect(body.cycles[0]?.closingBalance).toBe(889_000);
    expect(body.cycles[1]?.openingBalance).toBe(889_000);
  });

  it('answers the confirmed-only reading when asked', async () => {
    const body = (
      await windowServer(populated()).inject({
        method: 'GET',
        url: '/cycles?estimates=excluded',
      })
    ).json<CycleWindowResponse>();

    expect(body.estimates).toBe('excluded');
    expect(body.cycles[0]?.closingBalance).toBe(1_039_000);
  });

  it('answers 400 to an unknown estimates mode', async () => {
    const response = await windowServer().inject({
      method: 'GET',
      url: '/cycles?estimates=maybe',
    });

    expect(response.statusCode).toBe(400);
  });
});
