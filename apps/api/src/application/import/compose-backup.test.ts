import { describe, expect, it } from 'vitest';

import { noHolidays } from '../../domain/ports/holiday-calendar.js';
import { composeBackup, type ImportAnswers } from './compose-backup.js';
import type {
  MonthReading,
  SpreadsheetReading,
} from './interpret-spreadsheet.js';

const EXPORTED_AT = '2026-08-12T12:00:00.000Z';

function month(overrides: Partial<MonthReading> = {}): MonthReading {
  return {
    month: '2026-09',
    monthName: 'Setembro',
    isBlank: false,
    salary: 3_500_000,
    outcomes: [{ label: 'Convênio', amount: -29_300 }],
    variables: [],
    allocations: [],
    balances: [],
    derived: {
      totalOutcome: -29_300,
      surplus: 3_470_700,
      expectedSurplus: 3_470_700,
      netSurplus: 3_470_700,
    },
    ...overrides,
  };
}

function reading(
  overrides: Partial<SpreadsheetReading> = {},
): SpreadsheetReading {
  return {
    months: [month()],
    outcomeLabels: ['Convênio'],
    buckets: [],
    inference: { firstColumnYear: 2026, reasoning: '' },
    missing: [],
    warnings: [],
    ...overrides,
  };
}

const answers: ImportAnswers = {
  anchor: { anchorDay: 5, shiftPolicy: 'PRECEDING' },
  accounts: [{ name: 'Checking', type: 'CHECKING', balance: 100_000 }],
  cards: [],
  dueDays: { Convênio: 8, Salário: 5 },
  estimates: [],
  buckets: [],
  fromMonth: '2026-09',
};

const compose = (
  read: SpreadsheetReading = reading(),
  overrides: Partial<ImportAnswers> = {},
) => composeBackup(read, { ...answers, ...overrides }, EXPORTED_AT, noHolidays);

describe('composeBackup', () => {
  it('imports a month with no salary at all', () => {
    const composition = compose(
      reading({
        months: [
          month({
            salary: null,
            derived: { ...month().derived, surplus: null },
          }),
        ],
      }),
      { dueDays: { Convênio: 8 } },
    );

    expect(
      composition.document.templates.map((template) => template.name),
    ).toEqual(['Convênio']);
  });

  it('ends a template in the month it stops appearing', () => {
    const composition = compose(
      reading({
        months: [
          month({ month: '2026-09' }),
          month({ month: '2026-10', outcomes: [] }),
        ],
      }),
    );

    expect(composition.document.templates[0]?.endMonth).toBe('2026-09');
  });

  it('leaves a template open when it runs to the last month', () => {
    const composition = compose(
      reading({
        months: [month({ month: '2026-09' }), month({ month: '2026-10' })],
      }),
    );

    expect(composition.document.templates[0]?.endMonth).toBeNull();
  });

  it('flags a label the user is still guessing at', () => {
    const composition = compose(reading(), { estimates: ['Convênio'] });

    expect(composition.document.templates[0]?.isEstimate).toBe(true);
  });

  describe('buckets', () => {
    const withBucket = (
      bucketOverrides: Partial<SpreadsheetReading['buckets'][number]> = {},
    ) =>
      reading({
        buckets: [
          {
            name: 'Reserva',
            rule: { kind: 'PERCENT', percent: 20 },
            latestBalance: 500_000,
            balanceWasOverwritten: false,
            ...bucketOverrides,
          },
        ],
      });

    it('carries a goal target and date through', () => {
      const composition = compose(withBucket(), {
        buckets: [
          {
            name: 'Reserva',
            mode: 'GOAL',
            target: 5_000_000,
            targetDate: '2031-03-31',
            priority: 1,
          },
        ],
      });

      expect(composition.document.buckets[0]?.target).toEqual({
        amount: 5_000_000,
        date: '2031-03-31',
      });
    });

    it('gives an ongoing bucket no target', () => {
      const composition = compose(withBucket(), {
        buckets: [{ name: 'Reserva', mode: 'ONGOING', priority: 1 }],
      });

      expect(composition.document.buckets[0]?.target).toBeNull();
    });

    it('converts a percentage rule to basis points', () => {
      const composition = compose(withBucket(), {
        buckets: [{ name: 'Reserva', mode: 'ONGOING', priority: 1 }],
      });

      expect(composition.document.buckets[0]?.rule).toEqual({
        kind: 'PERCENT',
        basisPoints: 2000,
      });
    });

    it('carries a fixed rule as an amount', () => {
      const composition = compose(
        withBucket({ rule: { kind: 'FIXED', amount: 177_800 } }),
        { buckets: [{ name: 'Reserva', mode: 'ONGOING', priority: 1 }] },
      );

      expect(composition.document.buckets[0]?.rule).toEqual({
        kind: 'FIXED',
        amount: 177_800,
      });
    });

    it('falls back to a zero fixed rule when the sheet stated none', () => {
      const composition = compose(withBucket({ rule: null }), {
        buckets: [{ name: 'Reserva', mode: 'ONGOING', priority: 1 }],
      });

      expect(composition.document.buckets[0]?.rule).toEqual({
        kind: 'FIXED',
        amount: 0,
      });
    });

    it('records no opening event for a bucket with no balance', () => {
      const composition = compose(withBucket({ latestBalance: null }), {
        buckets: [{ name: 'Reserva', mode: 'ONGOING', priority: 1 }],
      });

      expect(composition.document.buckets[0]?.events).toEqual([]);
    });

    it('records no opening event for a bucket sitting at zero', () => {
      const composition = compose(withBucket({ latestBalance: 0 }), {
        buckets: [{ name: 'Reserva', mode: 'ONGOING', priority: 1 }],
      });

      expect(composition.document.buckets[0]?.events).toEqual([]);
    });

    // UC-6.7 — a correction carries a mandatory reason, so the seeded balance
    // is never mistaken for money that was actually saved here.
    it('opens at an observed balance as a correction with a reason', () => {
      const composition = compose(withBucket(), {
        buckets: [
          {
            name: 'Reserva',
            mode: 'ONGOING',
            priority: 1,
            seedBalance: 800_000,
          },
        ],
      });

      expect(composition.document.buckets[0]?.events).toEqual([
        {
          kind: 'CORRECTION',
          id: 'evt-1',
          date: '2026-08-12',
          newBalance: 800_000,
          reason: 'Opening balance imported from the spreadsheet.',
        },
      ]);
      expect(composition.notes.join(' ')).toMatch(/Reserva opened at/);
    });

    it('ignores an answer for a bucket the sheet never had', () => {
      const composition = compose(reading(), {
        buckets: [{ name: 'Ghost', mode: 'ONGOING', priority: 1 }],
      });

      expect(composition.document.buckets[0]?.rule).toEqual({
        kind: 'FIXED',
        amount: 0,
      });
    });
  });

  describe('reconciliation', () => {
    it('counts variables into Expected Surplus', () => {
      const composition = compose(
        reading({
          months: [
            month({
              variables: [{ label: 'Simão', amount: 50_000 }],
              derived: {
                totalOutcome: -29_300,
                surplus: 3_470_700,
                expectedSurplus: 3_520_700,
                netSurplus: 3_520_700,
              },
            }),
          ],
        }),
      );

      expect(composition.mismatches).toEqual([]);
    });

    it('reports a surplus the sheet computed differently', () => {
      const composition = compose(
        reading({
          months: [month({ derived: { ...month().derived, surplus: -1 } })],
        }),
      );

      expect(composition.mismatches).toEqual([
        { month: '2026-09', figure: 'surplus', sheet: -1, imported: 3_470_700 },
      ]);
    });

    it('says nothing about a figure the sheet never computed', () => {
      const composition = compose(
        reading({
          months: [
            month({
              derived: {
                totalOutcome: null,
                surplus: null,
                expectedSurplus: null,
                netSurplus: null,
              },
            }),
          ],
        }),
      );

      expect(composition.mismatches).toEqual([]);
    });
  });

  describe('notes', () => {
    it('says nothing about cards when there are none', () => {
      const composition = compose();

      expect(composition.notes.join(' ')).not.toMatch(/card invoices/);
    });

    it('carries the reading own warnings through', () => {
      const composition = compose(reading({ warnings: ['Something odd.'] }));

      expect(composition.notes).toContain('Something odd.');
    });

    // A cycle that imported empty because the column was blank looks like a
    // cycle with nothing in it, which is a different thing.
    it('names the cycles that were blank in the sheet', () => {
      const composition = compose(
        reading({
          months: [month(), month({ month: '2026-10', isBlank: true })],
        }),
      );

      expect(composition.notes.join(' ')).toMatch(/2026-10 is blank/);
    });

    it('names several blank cycles together', () => {
      const composition = compose(
        reading({
          months: [
            month(),
            month({ month: '2026-10', isBlank: true }),
            month({ month: '2026-11', isBlank: true }),
          ],
        }),
      );

      expect(composition.notes.join(' ')).toMatch(/2026-10, 2026-11 are blank/);
    });
  });
});
