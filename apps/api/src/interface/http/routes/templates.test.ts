import type { TemplateResponse, TemplatesResponse } from '@fin/contracts';
import { describe, expect, it } from 'vitest';

import { ManageTemplates } from '../../../application/budgeting/uc-2-manage-templates.js';
import {
  InMemoryCycleRepository,
  InMemorySettingsRepository,
  InMemoryTemplateRepository,
} from '../../../application/testing/fakes.js';
import { FixedClock } from '../../../application/testing/fixed-clock.js';
import {
  PaydayAnchor,
  ShiftPolicy,
} from '../../../domain/budgeting/cycle-ref.js';
import {
  Direction,
  RecurringTemplate,
} from '../../../domain/budgeting/recurring-template.js';
import { noHolidays } from '../../../domain/ports/holiday-calendar.js';
import { Money } from '../../../domain/shared/money.js';
import { buildTestServer } from '../testing/test-server.js';

const anchor = PaydayAnchor.of(5, ShiftPolicy.Preceding);
const clock = FixedClock.at('2026-08-10T12:00:00Z');

const template = (id: string, name: string, cents: number) =>
  RecurringTemplate.create({
    id,
    name,
    direction: cents < 0 ? Direction.Out : Direction.In,
    dueDayOfMonth: 8,
    amount: Money.fromCents(cents),
    startMonth: '2026-08',
  });

const serverWith = (...templates: RecurringTemplate[]) => {
  let next = 0;

  return buildTestServer({
    manageTemplates: new ManageTemplates(
      new InMemoryTemplateRepository(templates),
      new InMemoryCycleRepository(),
      new InMemorySettingsRepository(anchor),
      noHolidays,
      clock,
      () => `tpl-${String(++next)}`,
    ),
  });
};

describe('GET /templates', () => {
  it('lists them with the four summary figures', async () => {
    const app = serverWith(
      template('a', 'Salary', 1_800_000),
      template('b', 'Health Plan', -32_000),
    );

    const response = await app.inject({ method: 'GET', url: '/templates' });
    const body = response.json<TemplatesResponse>();

    expect(response.statusCode).toBe(200);
    expect(body.templates).toHaveLength(2);
    expect(body.summary.fixedIncome).toBe(1_800_000);
    expect(body.summary.fixedCommitment).toBe(32_000);
  });

  it('reports an empty list rather than failing', async () => {
    const body = (
      await serverWith().inject({ method: 'GET', url: '/templates' })
    ).json<TemplatesResponse>();

    expect(body.templates).toEqual([]);
    expect(body.summary.activeOutcomeCount).toBe(0);
  });
});

describe('POST /templates', () => {
  it('answers 201 with the template it created', async () => {
    const response = await serverWith().inject({
      method: 'POST',
      url: '/templates',
      payload: {
        name: 'Electricity',
        direction: 'OUT',
        dueDayOfMonth: 15,
        amount: -28_000,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json<TemplateResponse>().name).toBe('Electricity');
  });

  it.each([
    ['a missing body', {}],
    [
      'an unknown direction',
      { name: 'X', direction: 'SIDEWAYS', dueDayOfMonth: 1, amount: 1 },
    ],
    [
      'a non-numeric amount',
      { name: 'X', direction: 'OUT', dueDayOfMonth: 1, amount: 'lots' },
    ],
  ])('answers 400 to %s', async (_name, payload) => {
    const response = await serverWith().inject({
      method: 'POST',
      url: '/templates',
      payload,
    });

    expect(response.statusCode).toBe(400);
  });

  it('answers 400 to a due day that is not a day of the month', async () => {
    const response = await serverWith().inject({
      method: 'POST',
      url: '/templates',
      payload: { name: 'X', direction: 'OUT', dueDayOfMonth: 32, amount: -1 },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('PATCH /templates/:id/amount', () => {
  it('schedules a rise from a cycle onward', async () => {
    const app = serverWith(template('a', 'Salary', 1_000_000));

    const response = await app.inject({
      method: 'PATCH',
      url: '/templates/a/amount',
      payload: {
        fromMonth: '2026-09',
        amount: 1_800_000,
        scope: 'THIS_AND_FUTURE',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<TemplateResponse>().valueSchedule).toEqual([
      { fromMonth: '2026-09', amount: 1_800_000 },
    ]);
  });

  it('leaves the schedule alone for a this-cycle-only change', async () => {
    const app = serverWith(template('a', 'Salary', 1_000_000));

    const response = await app.inject({
      method: 'PATCH',
      url: '/templates/a/amount',
      payload: {
        fromMonth: '2026-08',
        amount: 1_200_000,
        scope: 'THIS_CYCLE_ONLY',
      },
    });

    expect(response.json<TemplateResponse>().valueSchedule).toEqual([]);
  });

  it('answers 400 to an unknown scope', async () => {
    const app = serverWith(template('a', 'Salary', 1_000_000));

    const response = await app.inject({
      method: 'PATCH',
      url: '/templates/a/amount',
      payload: { fromMonth: '2026-09', amount: 1, scope: 'EVERYWHERE' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('answers 404 for a template that is not there', async () => {
    const response = await serverWith().inject({
      method: 'PATCH',
      url: '/templates/missing/amount',
      payload: { fromMonth: '2026-09', amount: 1, scope: 'THIS_AND_FUTURE' },
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('PATCH /templates/:id', () => {
  it.each([
    [
      'pauses',
      { status: 'PAUSED' },
      (t: TemplateResponse) => t.status,
      'PAUSED',
    ],
    [
      'renames',
      { name: 'Renamed' },
      (t: TemplateResponse) => t.name,
      'Renamed',
    ],
    [
      'ends',
      { endMonth: '2026-12' },
      (t: TemplateResponse) => t.endMonth,
      '2026-12',
    ],
  ])('%s', async (_name, payload, read, expected) => {
    const app = serverWith(template('a', 'Health Plan', -32_000));

    const response = await app.inject({
      method: 'PATCH',
      url: '/templates/a',
      payload,
    });

    expect(read(response.json<TemplateResponse>())).toBe(expected);
  });

  it('flags an unconfirmed estimate', async () => {
    const app = serverWith(template('a', 'Contractor Costs', -150_000));

    const response = await app.inject({
      method: 'PATCH',
      url: '/templates/a',
      payload: { isEstimate: true },
    });

    expect(response.json<TemplateResponse>().isEstimate).toBe(true);
  });

  it('answers 400 when the body changes nothing', async () => {
    const app = serverWith(template('a', 'Health Plan', -32_000));

    const response = await app.inject({
      method: 'PATCH',
      url: '/templates/a',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('DELETE /templates/:id', () => {
  it('answers 204', async () => {
    const app = serverWith(template('a', 'Health Plan', -32_000));

    const response = await app.inject({
      method: 'DELETE',
      url: '/templates/a',
    });

    expect(response.statusCode).toBe(204);
  });

  it('answers 404 for a template that is not there', async () => {
    const response = await serverWith().inject({
      method: 'DELETE',
      url: '/templates/missing',
    });

    expect(response.statusCode).toBe(404);
  });
});
