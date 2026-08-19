import type { EstablishedRecordResponse } from '@fin/contracts';
import { describe, expect, it } from 'vitest';

import { correctionOf, formOf, parseRecord } from './record-fields.js';

const record = (
  over: Partial<EstablishedRecordResponse>,
): EstablishedRecordResponse => ({
  section: 'FIXED_BILLS',
  id: 'rec-1',
  summary: 'Health plan — R$ 320,00 on day 8.',
  ...over,
});

describe('the fields behind a record', () => {
  it('reads an account back out of the sentence it is shown as', () => {
    expect(
      parseRecord(
        record({
          section: 'ACCOUNTS',
          summary: 'Checking — a checking account holding R$ 2.160,00.',
        }),
      ),
    ).toEqual({
      kind: 'ACCOUNT',
      name: 'Checking',
      type: 'CHECKING',
      balance: 216_000,
    });
  });

  it.each([
    ['Health plan — R$ 320,00 on day 8.', false],
    ['Contractor costs — R$ 1.500,00 on day 8, an estimate.', true],
  ])('reads a bill and whether it is a guess — %s', (summary, isEstimate) => {
    expect(parseRecord(record({ summary }))).toMatchObject({
      kind: 'BILL',
      dueDayOfMonth: 8,
      isEstimate,
    });
  });

  it('reads a card, both its days and the account that pays it', () => {
    expect(
      parseRecord(
        record({
          section: 'CARDS',
          summary:
            'Inter — limit R$ 10.000,00, closing on day 28, due on day 10, paid from Checking.',
        }),
      ),
    ).toEqual({
      kind: 'CARD',
      name: 'Inter',
      limit: 1_000_000,
      closingDay: 28,
      dueDay: 10,
      paymentAccountName: 'Checking',
    });
  });

  it('reads an ongoing bucket as a share, with no target to reach', () => {
    expect(
      parseRecord(
        record({
          section: 'BUCKETS',
          summary:
            'Investments — 20 % of Expected Surplus each cycle, funded #2.',
        }),
      ),
    ).toEqual({
      kind: 'BUCKET',
      name: 'Investments',
      rule: { kind: 'PERCENT', percent: 20 },
      target: null,
    });
  });

  it('reads a goal bucket with the target it is aimed at', () => {
    expect(
      parseRecord(
        record({
          section: 'BUCKETS',
          summary:
            'Apartment — R$ 1.778,00 each cycle toward R$ 150.000,00 by 2031-03-05, funded #1.',
        }),
      ),
    ).toEqual({
      kind: 'BUCKET',
      name: 'Apartment',
      rule: { kind: 'FIXED', amount: 177_800 },
      target: { amount: 15_000_000, date: '2031-03-05' },
    });
  });

  // The anchor and the salary hold one value each and are said again.
  it('has no fields for a record holding a single value', () => {
    expect(
      parseRecord(
        record({ section: 'ANCHOR', id: null, summary: 'Paid on day 5.' }),
      ),
    ).toBeNull();
  });

  it('has no fields for a sentence it cannot read', () => {
    expect(
      parseRecord(record({ summary: 'Something else entirely' })),
    ).toBeNull();
  });
});

describe('what a saved edit actually asks for', () => {
  const bill = parseRecord(record({}));
  if (bill === null) throw new Error('the bill should have parsed');

  it('states only the field that changed', () => {
    expect(
      correctionOf(bill, { ...formOf(bill), amount: '350' }).request,
    ).toEqual({ amount: 35_000 });
  });

  it('asks for nothing when the form is saved untouched', () => {
    expect(correctionOf(bill, formOf(bill)).request).toEqual({});
  });

  it('refuses a figure it cannot read rather than sending a zero', () => {
    const { request, errors } = correctionOf(bill, {
      ...formOf(bill),
      amount: 'three hundred',
    });

    expect(request).toEqual({});
    expect(errors.amount).toBeDefined();
  });

  it('keeps a name it was given and refuses an empty one', () => {
    const { request, errors } = correctionOf(bill, {
      ...formOf(bill),
      name: '  ',
    });

    expect(request).toEqual({});
    expect(errors.name).toBeDefined();
  });
});

describe('what a saved edit asks for on a goal bucket', () => {
  const goal = parseRecord(
    record({
      section: 'BUCKETS',
      summary:
        'Apartment — 20 % of Expected Surplus each cycle toward R$ 150.000,00 by 2031-03-05, funded #1.',
    }),
  );
  if (goal === null) throw new Error('the goal should have parsed');

  it('swaps a share for a fixed amount each cycle', () => {
    expect(
      correctionOf(goal, {
        ...formOf(goal),
        ruleKind: 'FIXED',
        ruleAmount: '1.778,00',
      }).request,
    ).toEqual({ rule: { kind: 'FIXED', amount: 177_800 } });
  });

  it('moves the date the target is aimed at', () => {
    expect(
      correctionOf(goal, { ...formOf(goal), targetDate: '2032-03-05' }).request,
    ).toEqual({ targetDate: '2032-03-05' });
  });

  it('refuses a share it cannot read', () => {
    const { request, errors } = correctionOf(goal, {
      ...formOf(goal),
      percent: 'lots',
    });

    expect(request).toEqual({});
    expect(errors.percent).toBeDefined();
  });
});
