import { describe, expect, it } from 'vitest';

import { LocalDate } from '../../domain/shared/local-date.js';
import { interpretSpreadsheet } from './interpret-spreadsheet.js';
import { grid, type GridSpec } from './testing/grid.js';

const on = (iso: string) => LocalDate.parse(iso);

/**
 * Two month columns shaped like the real sheet: labels in the odd column,
 * amounts in the one beside it, and the block boundaries stated by the
 * spreadsheet's own SUM formulas.
 */
const twoMonths: GridSpec = {
  A1: 'Julho',
  C1: 'Agosto',

  A2: 'Convênio',
  B2: -293,
  C2: 'Convênio',
  D2: -293,
  A3: 'Energia',
  B3: -300.5,
  C3: 'Energia',
  D3: -310,

  A14: 'Salário',
  B14: 12600,
  C14: 'Salário',
  D14: 35000,

  A16: 'Total Gasto',
  B16: ['=SUM(B2:B13)', -593.5],
  C16: 'Total Gasto',
  D16: ['=SUM(D2:D13)', -603],

  A17: 'Sobra',
  B17: ['=B14+B16', 12006.5],
  C17: 'Sobra',
  D17: ['=D14+D16', 34397],

  A20: 'Variáveis',
  B20: ['=SUM(B21:B23)', 500],
  C20: 'Variáveis',
  D20: ['=SUM(D21:D23)', 0],
  A21: 'Simão',
  B21: 500,

  A26: 'Sobra Esperada',
  B26: ['=B17+B20', 12506.5],
  C26: 'Sobra Esperada',
  D26: ['=D17+D20', 34397],

  A28: 'Reserva',
  B28: ['=B26*0.2', 2501.3],
  C28: 'Reserva',
  D28: ['=D26*0.2', 6879.4],
  A29: 'Investimentos',
  B29: ['=B26*0.1', 1250.65],
  C29: 'Investimentos',
  D29: ['=D26*0.1', 3439.7],

  A33: 'Sobra Real',
  B33: ['=B26-B28-B29', 8754.55],
  C33: 'Sobra Real',
  D33: ['=D26-D28-D29', 24077.9],

  A35: 'Reserva Real',
  B35: ['=21000+B16', 20406.5],
  C35: 'Reserva Real',
  D35: ['=B35+D28', 27285.9],
  A36: 'Investimentos Real',
  B36: 1250.65,
  C36: 'Investimentos Real',
  D36: ['=B36+D29', 4690.35],
};

const read = (spec: GridSpec = twoMonths, iso = '2026-08-12') =>
  interpretSpreadsheet(grid(spec), { referenceDate: on(iso) });

describe('interpretSpreadsheet', () => {
  describe('the month columns', () => {
    it('reads one cycle per column pair', () => {
      const reading = read();

      expect(reading.months.map((month) => month.monthName)).toEqual([
        'Julho',
        'Agosto',
      ]);
    });

    /**
     * A spreadsheet column heading already means the month the money is spent
     * in, which is exactly what a cycle is named for — so a column maps onto
     * the cycle of the same name, never shifted by one.
     */
    it('maps a column onto the cycle of the same name', () => {
      const reading = read();

      expect(reading.months.map((month) => month.month)).toEqual([
        '2026-07',
        '2026-08',
      ]);
    });

    // The sheet names months but never years, so this is inferred and has to
    // be stated rather than assumed.
    it('explains how it decided the years', () => {
      const reading = read();

      expect(reading.inference.reasoning).toMatch(/Agosto/);
      expect(reading.inference.reasoning).toMatch(/2026/);
    });

    it('rolls the year forward when the months wrap', () => {
      const reading = read(
        { A1: 'Dezembro', C1: 'Janeiro', E1: 'Fevereiro' },
        '2026-12-10',
      );

      expect(reading.months.map((month) => month.month)).toEqual([
        '2026-12',
        '2027-01',
        '2027-02',
      ]);
    });

    // The real sheet spans more than a year, so 'Abril' appears twice and the
    // two must land a year apart.
    it('separates a month that appears twice', () => {
      const reading = read(
        {
          A1: 'Abril',
          C1: 'Maio',
          E1: 'Junho',
          G1: 'Julho',
          I1: 'Agosto',
          K1: 'Setembro',
          M1: 'Outubro',
          O1: 'Novembro',
          Q1: 'Dezembro',
          S1: 'Janeiro',
          U1: 'Fevereiro',
          W1: 'Março',
          Y1: 'Abril',
        },
        '2026-04-10',
      );

      expect(reading.months.map((month) => month.month)).toEqual([
        '2025-04',
        '2025-05',
        '2025-06',
        '2025-07',
        '2025-08',
        '2025-09',
        '2025-10',
        '2025-11',
        '2025-12',
        '2026-01',
        '2026-02',
        '2026-03',
        '2026-04',
      ]);
    });

    it('accepts a corrected first year', () => {
      const reading = interpretSpreadsheet(grid(twoMonths), {
        referenceDate: on('2026-08-12'),
        firstColumnYear: 2030,
      });

      expect(reading.months[0]?.month).toBe('2030-07');
    });
  });

  describe('the amounts', () => {
    // Float reais are the spreadsheet's specific failure; nothing downstream
    // may see one.
    it('converts reais to integer cents exactly', () => {
      const reading = read();

      expect(reading.months[0]?.outcomes).toEqual([
        { label: 'Convênio', amount: -29300 },
        { label: 'Energia', amount: -30050 },
      ]);
    });

    it('rounds rather than truncating', () => {
      const reading = read({
        ...twoMonths,
        B3: -552.54,
        B16: ['=SUM(B2:B13)', -845.54],
      });

      expect(reading.months[0]?.outcomes[1]?.amount).toBe(-55254);
    });

    it('reads the salary and the variables', () => {
      const reading = read();

      expect(reading.months[0]?.salary).toBe(1_260_000);
      expect(reading.months[0]?.variables).toEqual([
        { label: 'Simão', amount: 50000 },
      ]);
    });

    /**
     * Carried so the import can be reconciled against the spreadsheet's own
     * arithmetic afterwards — a figure that quietly differs is worse than one
     * that is missing.
     */
    it('carries the sheet own derived figures', () => {
      const reading = read();

      expect(reading.months[1]?.derived).toEqual({
        totalOutcome: -60300,
        surplus: 3_439_700,
        expectedSurplus: 3_439_700,
        netSurplus: 2_407_790,
      });
    });
  });

  describe('the layout', () => {
    // A bill can move rows partway across the sheet, so nothing may be keyed
    // on a row number.
    it('keys a bill on its label, not on its row', () => {
      const reading = read({
        ...twoMonths,
        C3: null,
        D3: null,
        C4: 'Energia',
        D4: -310,
      });

      expect(reading.months[1]?.outcomes).toContainEqual({
        label: 'Energia',
        amount: -31000,
      });
      expect(reading.outcomeLabels).toEqual(['Convênio', 'Energia']);
    });

    it('takes the outcome block from the sheet own total', () => {
      const reading = read();

      expect(reading.months[0]?.outcomes).toHaveLength(2);
    });

    // An amount the sheet's own totals do not include is a mistake in the
    // spreadsheet, and silently importing it would change the numbers.
    it('warns about amounts outside every block', () => {
      const reading = read({
        ...twoMonths,
        A24: 'Saude - Tractian',
        B24: 330,
      });

      expect(reading.warnings.join(' ')).toMatch(/Saude - Tractian/);
    });

    it('reports a column with no amounts as blank', () => {
      const reading = read({ ...twoMonths, D2: null, D3: null, D14: null });

      expect(reading.months[1]?.isBlank).toBe(false);
      expect(read({ A1: 'Julho', C1: 'Agosto' }).months[1]?.isBlank).toBe(true);
    });
  });

  /**
   * The app holds a rolling twelve cycles and never reaches further back, so a
   * row that stopped before the current one is history. Asking the user for
   * its due day would be asking about something that will not be imported.
   */
  describe('what is still live', () => {
    const withHistory: GridSpec = {
      ...twoMonths,
      // Julho is behind the current column and carries a bill of its own.
      A4: 'Faculdade',
      B4: -400,
      A30: 'Viagem Europa',
      B30: ['=B26*0.3', 3751.95],
      B33: ['=B26-B28-B29-B30', 5002.6],
      A40: 'Viagem Europa Real',
      B40: 3751.95,
    };

    it('names today as the column the app is standing in', () => {
      expect(read().currentMonth).toBe('2026-08');
    });

    it('leaves out a bill that stopped before the current cycle', () => {
      const reading = read(withHistory);

      expect(reading.outcomeLabels).toEqual(['Convênio', 'Energia']);
    });

    it('leaves out a bucket that stopped before the current cycle', () => {
      const reading = read(withHistory);

      expect(reading.buckets.map((bucket) => bucket.name)).toEqual([
        'Reserva',
        'Investimentos',
      ]);
    });

    // Dropped quietly is how an import loses something without anyone noticing.
    it('says what it left behind', () => {
      const warnings = read(withHistory).warnings.join(' ');

      expect(warnings).toMatch(/Faculdade stopped before the current cycle/);
      expect(warnings).toMatch(
        /Viagem Europa stopped before the current cycle/,
      );
    });

    it('keeps a bill that is blank now but returns later', () => {
      const reading = read({
        ...twoMonths,
        D3: null,
        E1: 'Setembro',
        E3: 'Energia',
        F3: -320,
      });

      expect(reading.outcomeLabels).toContain('Energia');
    });

    it('falls back to the first column when none names this month', () => {
      const reading = read({ A1: 'Janeiro', C1: 'Fevereiro' }, '2026-08-12');

      expect(reading.currentMonth).toBe('2026-01');
    });
  });

  describe('the buckets', () => {
    it('pairs an allocation row with its running balance', () => {
      const reading = read();

      expect(reading.buckets.map((bucket) => bucket.name)).toEqual([
        'Reserva',
        'Investimentos',
      ]);
    });

    // The computed number has lost the intent; the formula still carries it.
    it('reads the allocation rule from the formula', () => {
      const reading = read();

      expect(reading.buckets[0]?.rule).toEqual({
        kind: 'PERCENT',
        percent: 20,
      });
      expect(reading.buckets[1]?.rule).toEqual({
        kind: 'PERCENT',
        percent: 10,
      });
    });

    /**
     * A bucket started partway along the sheet only appears in the Sobra Real
     * formulas from that column onward, so the allocation rows have to be the
     * union across every column rather than whichever formula is read first.
     */
    it('finds a bucket that only appears later in the sheet', () => {
      const reading = read({
        ...twoMonths,
        C30: 'Apartamento',
        D30: ['=D26*0.2', 6879.4],
        D33: ['=D26-D28-D29-D30', 17198.5],
        C38: 'Apartamento Real',
        D38: ['=D30', 6879.4],
      });

      expect(reading.buckets.map((bucket) => bucket.name)).toEqual([
        'Reserva',
        'Investimentos',
        'Apartamento',
      ]);
      expect(reading.buckets[2]?.rule).toEqual({
        kind: 'PERCENT',
        percent: 20,
      });
    });

    it('falls back to a fixed amount when there is no formula', () => {
      const reading = read({ ...twoMonths, B28: 2501.3, D28: 1000 });

      expect(reading.buckets[0]?.rule).toEqual({
        kind: 'FIXED',
        amount: 100_000,
      });
    });

    it('carries the latest real balance', () => {
      const reading = read();

      expect(reading.buckets[0]?.latestBalance).toBe(2_728_590);
    });

    /**
     * `=21000+B16` is a balance typed over the running total. The history is
     * gone, and pretending otherwise is what the bucket event log exists to
     * prevent — so it is flagged for the user to seed deliberately.
     */
    it('flags a balance that was typed over the running total', () => {
      const reading = read();

      expect(reading.buckets[0]?.balanceWasOverwritten).toBe(true);
      expect(reading.buckets[1]?.balanceWasOverwritten).toBe(false);
    });
  });

  // What the wizard has to ask for, because the sheet holds none of it.
  it('lists what the spreadsheet cannot say', () => {
    const reading = read();

    expect(reading.missing).toEqual([
      'The payday anchor — the sheet holds no dates at all.',
      'A due day for every bill, which is what gives the ledger a running balance.',
      'Which of the outcome rows are credit cards, and their closing day, due day and limit.',
      'The accounts money sits in, and their balances.',
      'Whether each bucket is a goal or ongoing, and a goal’s target and target date.',
    ]);
  });

  it('refuses a sheet with no month columns', () => {
    expect(() => read({ A1: 'Nothing' })).toThrow(/month/i);
  });

  /**
   * The layout is read from the sheet's own formulas, so a sheet that states
   * less has to come back emptier rather than fall back on row numbers that
   * happen to match this one.
   */
  describe('a sheet that states less than the real one', () => {
    const bare: GridSpec = { A1: 'Julho', C1: 'Agosto' };

    it('finds no outcomes without a Total Gasto formula', () => {
      const reading = read({ ...bare, A16: 'Total Gasto', B16: -100 });

      expect(reading.months[0]?.outcomes).toEqual([]);
      expect(reading.outcomeLabels).toEqual([]);
    });

    it('finds no outcomes when the total is not a SUM of a range', () => {
      const reading = read({
        ...bare,
        A16: 'Total Gasto',
        B16: ['=B2+B3', -100],
      });

      expect(reading.months[0]?.outcomes).toEqual([]);
    });

    it('finds no buckets without a Sobra Real formula', () => {
      const reading = read({ ...bare, A33: 'Sobra Real', B33: 100 });

      expect(reading.buckets).toEqual([]);
    });

    it('leaves a derived figure null when the sheet has no such row', () => {
      const reading = read(bare);

      expect(reading.months[0]?.derived).toEqual({
        totalOutcome: null,
        surplus: null,
        expectedSurplus: null,
        netSurplus: null,
      });
      expect(reading.months[0]?.salary).toBeNull();
    });

    it('omits a balance for an allocation with no Real row', () => {
      const reading = read({
        ...twoMonths,
        A36: null,
        B36: null,
        C36: null,
        D36: null,
      });

      expect(reading.months[0]?.balances.map((b) => b.label)).toEqual([
        'Reserva Real',
      ]);
      expect(reading.buckets[1]?.latestBalance).toBeNull();
    });

    it('ignores an allocation row the sheet subtracts but never labels', () => {
      const reading = read({
        ...twoMonths,
        B33: ['=B26-B28-B29-B99', 8754.55],
      });

      expect(reading.buckets.map((bucket) => bucket.name)).toEqual([
        'Reserva',
        'Investimentos',
      ]);
    });

    it('reports no rule for an allocation that is only ever zero', () => {
      const reading = read({ ...twoMonths, B29: 0, D29: 0 });

      expect(reading.buckets[1]?.rule).toBeNull();
    });
  });

  describe('awkward cells', () => {
    it('reads an amount stored as text', () => {
      const reading = read({ ...twoMonths, B2: '-293' });

      expect(reading.months[0]?.outcomes[0]?.amount).toBe(-29300);
    });

    it('ignores an amount that is not a number at all', () => {
      const reading = read({ ...twoMonths, B2: 'n/a' });

      expect(reading.months[0]?.outcomes.map((o) => o.label)).toEqual([
        'Energia',
      ]);
    });

    it('skips a row whose label is blank in that column', () => {
      const reading = read({ ...twoMonths, C2: '  ', D2: -1 });

      expect(reading.months[1]?.outcomes.map((o) => o.label)).toEqual([
        'Energia',
      ]);
    });

    it('ignores a cell reference it cannot parse', () => {
      const reading = read({ ...twoMonths, notARef: 1 });

      expect(reading.months).toHaveLength(2);
    });
  });

  it('says so plainly when no column names the current month', () => {
    const reading = read({ A1: 'Janeiro', C1: 'Fevereiro' }, '2026-08-12');

    expect(reading.inference.reasoning).toMatch(
      /No column names the month we are in/,
    );
    expect(reading.months[0]?.month).toBe('2026-01');
  });
});
