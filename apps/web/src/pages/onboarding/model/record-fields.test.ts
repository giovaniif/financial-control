import type {
  EstablishedBillFields,
  EstablishedRecordResponse,
} from '@fin/contracts';
import { describe, expect, it } from 'vitest';

import { correctionOf, formOf, parseRecord } from './record-fields.js';

const record = (
  over: Partial<EstablishedBillFields> = {},
): EstablishedRecordResponse => ({
  section: 'FIXED_BILLS',
  id: 'rec-1',
  summary: 'Health plan — R$ 320,00 on day 8.',
  fields: {
    name: 'Health plan',
    amount: -32_000,
    dueDayOfMonth: 8,
    isEstimate: false,
    ...over,
  },
});

describe('the fields behind a record', () => {
  it('reads an account from the fields the turn sent, not from its sentence', () => {
    expect(
      parseRecord({
        section: 'ACCOUNTS',
        id: 'rec-1',
        summary: 'Checking — a checking account holding R$ 2.160,00.',
        fields: { name: 'Checking', type: 'CHECKING', balance: 216_000 },
      }),
    ).toEqual({
      kind: 'ACCOUNT',
      name: 'Checking',
      type: 'CHECKING',
      balance: 216_000,
    });
  });

  it.each([[false], [true]])(
    'reads a bill and whether it is a guess — %s',
    (isEstimate) => {
      expect(parseRecord(record({ isEstimate }))).toEqual({
        kind: 'BILL',
        name: 'Health plan',
        // The domain holds an outgoing amount as negative; the editor asks
        // what the bill costs, which is the figure the sentence states.
        amount: 32_000,
        dueDayOfMonth: 8,
        isEstimate,
      });
    },
  );

  it('reads a card, both its days and the account that pays it', () => {
    expect(
      parseRecord({
        section: 'CARDS',
        id: 'rec-1',
        summary:
          'Inter — limit R$ 10.000,00, closing on day 28, due on day 10, paid from Checking.',
        fields: {
          name: 'Inter',
          limit: 1_000_000,
          closingDay: 28,
          dueDay: 10,
          paymentAccountName: 'Checking',
        },
      }),
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
      parseRecord({
        section: 'BUCKETS',
        id: 'rec-1',
        summary:
          'Investments — 20 % of Expected Surplus each cycle, funded #2.',
        fields: {
          mode: 'ONGOING',
          name: 'Investments',
          rule: { kind: 'PERCENT', percent: 20 },
          priority: 2,
        },
      }),
    ).toEqual({
      kind: 'BUCKET',
      name: 'Investments',
      rule: { kind: 'PERCENT', percent: 20 },
      target: null,
    });
  });

  it('reads a goal bucket with the target it is aimed at', () => {
    expect(
      parseRecord({
        section: 'BUCKETS',
        id: 'rec-1',
        summary:
          'Apartment — R$ 1.778,00 each cycle toward R$ 150.000,00 by 2031-03-05, funded #1.',
        fields: {
          mode: 'GOAL',
          name: 'Apartment',
          rule: { kind: 'FIXED', amount: 177_800 },
          priority: 1,
          target: 15_000_000,
          targetDate: '2031-03-05',
        },
      }),
    ).toEqual({
      kind: 'BUCKET',
      name: 'Apartment',
      rule: { kind: 'FIXED', amount: 177_800 },
      target: { amount: 15_000_000, date: '2031-03-05' },
    });
  });

  /**
   * The whole point of FIN-124: the sentence is written for a person and may
   * be reworded at any time, and the editor still opens on what the record
   * actually says.
   */
  it('reads a record whose sentence has been reworded', () => {
    expect(
      parseRecord({
        ...record(),
        summary: 'Your health plan costs 320 a month, on the 8th.',
      }),
    ).toMatchObject({ kind: 'BILL', amount: 32_000, dueDayOfMonth: 8 });
  });

  // The anchor and the salary hold one value each and are said again.
  it('has no fields for a record holding a single value', () => {
    expect(
      parseRecord({
        section: 'ANCHOR',
        id: null,
        summary: 'Paid on day 5.',
        fields: null,
      }),
    ).toBeNull();
  });
});

describe('what a saved edit actually asks for', () => {
  const bill = parseRecord(record());
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
  const goal = parseRecord({
    section: 'BUCKETS',
    id: 'rec-1',
    summary:
      'Apartment — 20 % of Expected Surplus each cycle toward R$ 150.000,00 by 2031-03-05, funded #1.',
    fields: {
      mode: 'GOAL',
      name: 'Apartment',
      rule: { kind: 'PERCENT', percent: 20 },
      priority: 1,
      target: 15_000_000,
      targetDate: '2031-03-05',
    },
  });
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
