import { describe, expect, it } from 'vitest';

import { noHolidays } from '../../domain/ports/holiday-calendar.js';
import { BackupRestore } from '../backup/uc-1-6-backup-restore.js';
import {
  InMemoryAccountRepository,
  InMemoryBucketRepository,
  InMemoryCardRepository,
  InMemoryCycleRepository,
  InMemorySettingsRepository,
  InMemorySpreadsheetReader,
  InMemoryTemplateRepository,
} from '../testing/fakes.js';
import { FixedClock } from '../testing/fixed-clock.js';
import { grid } from './testing/grid.js';
import {
  DueDayOutsideCycle,
  ImportAnswersIncomplete,
  type ImportAnswers,
} from './compose-backup.js';
import { ImportSpreadsheet } from './uc-1-7-import-spreadsheet.js';

const clock = FixedClock.at('2026-08-12T12:00:00Z');

function build() {
  const repos = {
    cycles: new InMemoryCycleRepository(),
    accounts: new InMemoryAccountRepository(),
    templates: new InMemoryTemplateRepository(),
    cards: new InMemoryCardRepository(),
    buckets: new InMemoryBucketRepository(),
    settings: new InMemorySettingsRepository(),
  };
  const restore = new BackupRestore(
    repos.cycles,
    repos.accounts,
    repos.templates,
    repos.cards,
    repos.buckets,
    repos.settings,
    noHolidays,
    clock,
  );

  return {
    repos,
    useCase: new ImportSpreadsheet(
      new InMemorySpreadsheetReader({ sheets: [sheet] }),
      restore,
      noHolidays,
      clock,
    ),
  };
}

/** Two future columns, shaped like the real sheet. */
const sheet = grid({
  A1: 'Agosto',
  C1: 'Setembro',

  A2: 'Convênio',
  B2: -293,
  C2: 'Convênio',
  D2: -293,
  A3: 'Evoluçao Obra',
  B3: -2600,
  C3: 'Evoluçao Obra',
  D3: -2650,
  A4: 'Inter',
  B4: -7000,
  C4: 'Inter',
  D4: -9000,

  A14: 'Salário',
  B14: 35000,
  C14: 'Salário',
  D14: 35000,

  A16: 'Total Gasto',
  B16: ['=SUM(B2:B13)', -9893],
  C16: 'Total Gasto',
  D16: ['=SUM(D2:D13)', -11943],

  A17: 'Sobra',
  B17: ['=B14+B16', 25107],
  C17: 'Sobra',
  D17: ['=D14+D16', 23057],

  A20: 'Variáveis',
  B20: ['=SUM(B21:B23)', 0],
  C20: 'Variáveis',
  D20: ['=SUM(D21:D23)', 0],

  A26: 'Sobra Esperada',
  B26: ['=B17+B20', 25107],
  C26: 'Sobra Esperada',
  D26: ['=D17+D20', 23057],

  A28: 'Reserva',
  B28: ['=B26*0.2', 5021.4],
  C28: 'Reserva',
  D28: ['=D26*0.2', 4611.4],

  A33: 'Sobra Real',
  B33: ['=B26-B28', 20085.6],
  C33: 'Sobra Real',
  D33: ['=D26-D28', 18445.6],

  A35: 'Reserva Real',
  B35: 5021.4,
  C35: 'Reserva Real',
  D35: ['=B35+D28', 9632.8],
});

/** The reader is a port; the bytes never matter to an interactor test. */
const workbook = new Uint8Array();

const answers: ImportAnswers = {
  anchor: { anchorDay: 5, shiftPolicy: 'PRECEDING' },
  accounts: [{ name: 'Inter Checking', type: 'CHECKING', balance: 216_000 }],
  cards: [
    {
      label: 'Inter',
      closingDay: 28,
      dueDay: 10,
      limit: 2_000_000,
      paymentAccountName: 'Inter Checking',
    },
  ],
  dueDays: { Convênio: 8, 'Evoluçao Obra': 15, Salário: 5 },
  estimates: [],
  buckets: [{ name: 'Reserva', mode: 'ONGOING', priority: 1 }],
  fromMonth: '2026-08',
};

describe('ImportSpreadsheet', () => {
  it('reads a workbook without writing anything', async () => {
    const { useCase, repos } = build();

    const reading = useCase.read(workbook);

    expect(reading.months.map((month) => month.month)).toEqual([
      '2026-08',
      '2026-09',
    ]);
    expect(await repos.templates.findAll()).toEqual([]);
    expect(await repos.settings.isConfigured()).toBe(false);
  });

  it('accepts a corrected first year', () => {
    const { useCase } = build();

    const reading = useCase.read(workbook, 2030);

    expect(reading.months[0]?.month).toBe('2030-08');
  });

  describe('applying', () => {
    const apply = async () => {
      const built = build();
      const reading = built.useCase.read(workbook);
      const report = await built.useCase.apply(reading, answers);

      return { ...built, report };
    };

    it('lands data the app can actually read back', async () => {
      const { repos, report } = await apply();

      expect(report.imported).toEqual({
        templates: 4,
        accounts: 1,
        cards: 1,
        buckets: 1,
        months: 2,
      });
      expect((await repos.accounts.findAll())[0]?.name).toBe('Inter Checking');
      expect(await repos.settings.isConfigured()).toBe(true);
    });

    /**
     * UC-2.4 — an amount that steps across months is one template changing,
     * not several bills. The spreadsheet carried it as a row per month.
     */
    it('turns a stepping amount into one template with a value schedule', async () => {
      const { repos } = await apply();
      const templates = await repos.templates.findAll();
      const obra = templates.find(
        (template) => template.name === 'Evoluçao Obra',
      );

      expect(obra?.baseAmount.cents).toBe(-260_000);
      expect(
        obra?.valueSchedule.map((step) => [step.fromMonth, step.amount.cents]),
      ).toEqual([['2026-09', -265_000]]);
    });

    it('flags a card row as an estimate, since it is only a total', async () => {
      const { repos } = await apply();
      const templates = await repos.templates.findAll();

      expect(
        templates.find((template) => template.name === 'Inter')?.isEstimate,
      ).toBe(true);
      expect(
        templates.find((template) => template.name === 'Convênio')?.isEstimate,
      ).toBe(false);
    });

    it('says plainly that the cards did not come across as invoices', async () => {
      const { report } = await apply();

      expect(report.notes.join(' ')).toMatch(
        /Inter came across as recurring estimates, not as card invoices/,
      );
    });

    it('still registers the card itself, for purchases from now on', async () => {
      const { repos } = await apply();
      const [card] = await repos.cards.findAll();

      expect(card?.name).toBe('Inter');
      expect(card?.closingDay).toBe(28);
    });

    it('opens a bucket at its observed balance, as a correction', async () => {
      const { repos } = await apply();
      const [bucket] = await repos.buckets.findAll();

      expect(bucket?.balance.cents).toBe(963_280);
      expect(bucket?.events[0]?.kind).toBe('CORRECTION');
    });

    it('reads the allocation rule off the formula', async () => {
      const { repos } = await apply();
      const [bucket] = await repos.buckets.findAll();

      expect(bucket?.rule.kind).toBe('PERCENT');
      expect(
        bucket?.rule.kind === 'PERCENT'
          ? bucket.rule.percentage.basisPoints
          : undefined,
      ).toBe(2000);
    });

    // A figure that quietly differs from the spreadsheet is worse than one
    // that is missing.
    it('reconciles against the sheet own arithmetic', async () => {
      const { report } = await apply();

      expect(report.mismatches).toEqual([]);
    });

    it('reports a figure the sheet totals differently', async () => {
      const built = build();
      const reading = built.useCase.read(workbook);
      const first = reading.months[0];
      if (first !== undefined) {
        first.derived.totalOutcome = -999_999;
      }

      const report = await built.useCase.apply(reading, answers);

      expect(report.mismatches).toEqual([
        {
          month: '2026-08',
          figure: 'totalOutcome',
          sheet: -999_999,
          imported: -989_300,
        },
      ]);
    });

    // Restore replaces the whole dataset, so running the import twice must
    // leave exactly one of everything.
    it('is safe to run twice', async () => {
      const built = build();
      const reading = built.useCase.read(workbook);

      await built.useCase.apply(reading, answers);
      await built.useCase.apply(reading, answers);

      expect(await built.repos.templates.findAll()).toHaveLength(4);
      expect(await built.repos.accounts.findAll()).toHaveLength(1);
    });

    it('says what it left behind', async () => {
      const { report } = await apply();

      expect(report.notes.join(' ')).toMatch(/Cycles before 2026-08/);
    });
  });

  describe('refusing an import it cannot make honest', () => {
    const applyWith = async (overrides: Partial<ImportAnswers>) => {
      const built = build();
      const reading = built.useCase.read(workbook);

      return built.useCase.apply(reading, { ...answers, ...overrides });
    };

    it('needs a due day for every bill', async () => {
      await expect(applyWith({ dueDays: {} })).rejects.toThrow(
        ImportAnswersIncomplete,
      );
    });

    it('names the bills whose due day is missing', async () => {
      await expect(applyWith({ dueDays: {} })).rejects.toThrow(/Convênio/);
    });

    // The payday anchor already says when the salary arrives — UC-1.1.
    it('does not need one for the salary', async () => {
      await expect(
        applyWith({ dueDays: { Convênio: 8, 'Evoluçao Obra': 15 } }),
      ).resolves.toBeDefined();
    });

    it('needs at least one account', async () => {
      await expect(applyWith({ accounts: [] })).rejects.toThrow(
        /at least one account/i,
      );
    });

    it('refuses a card paid from an account that does not exist', async () => {
      await expect(
        applyWith({
          cards: answers.cards.map((card) => ({
            ...card,
            paymentAccountName: 'Nowhere',
          })),
        }),
      ).rejects.toThrow(/Nowhere/);
    });

    // UC-6.1 — a goal without both is not a goal.
    it('refuses a goal with no target date', async () => {
      await expect(
        applyWith({
          buckets: [
            { name: 'Reserva', mode: 'GOAL', target: 100, priority: 1 },
          ],
        }),
      ).rejects.toThrow(/target and a target date/);
    });

    /**
     * A due day the cycle never reaches generates nothing at all, silently.
     * With pay on the 30th the August 2026 cycle runs 30 Jul – 27 Aug, so day
     * 28 exists in neither month the cycle spans.
     */
    it('refuses a due day that lands in a gap the cycle never reaches', async () => {
      await expect(
        applyWith({
          anchor: { anchorDay: 30, shiftPolicy: 'PRECEDING' },
          dueDays: { Convênio: 28, 'Evoluçao Obra': 15, Salário: 5 },
        }),
      ).rejects.toThrow(DueDayOutsideCycle);
    });

    it('refuses when nothing is left to import', async () => {
      await expect(applyWith({ fromMonth: '2099-01' })).rejects.toThrow(
        /No column holds anything/,
      );
    });
  });
});
