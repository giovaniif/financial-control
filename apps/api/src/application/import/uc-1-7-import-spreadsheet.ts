import type { Clock } from '../../domain/ports/clock.js';
import type { HolidayCalendar } from '../../domain/ports/holiday-calendar.js';
import type { SpreadsheetReader } from '../../domain/ports/spreadsheet-reader.js';
import { LocalDate } from '../../domain/shared/local-date.js';
import type { BackupRestore } from '../backup/uc-1-6-backup-restore.js';
import {
  interpretSpreadsheet,
  UnrecognisedSpreadsheet,
  type SpreadsheetReading,
} from './interpret-spreadsheet.js';
import {
  composeBackup,
  type ImportAnswers,
  type ReconciliationRow,
} from './compose-backup.js';

export interface ImportReport {
  imported: {
    templates: number;
    accounts: number;
    cards: number;
    buckets: number;
    months: number;
  };
  /** Where the import differs from the spreadsheet's own arithmetic. */
  mismatches: ReconciliationRow[];
  notes: string[];
}

/**
 * UC-1.7 — import from the "Controle Financeiro" spreadsheet.
 *
 * Two calls, and nothing is persisted between them: reading a workbook returns
 * what it holds, and applying takes that reading back with everything the
 * sheet could not say. There is no half-finished import to clean up, and the
 * restore it ends in already replaces the whole dataset, so re-running is
 * safe.
 */
export class ImportSpreadsheet {
  constructor(
    private readonly reader: SpreadsheetReader,
    private readonly backup: BackupRestore,
    private readonly holidays: HolidayCalendar,
    private readonly clock: Clock,
  ) {}

  read(bytes: Uint8Array, firstColumnYear?: number): SpreadsheetReading {
    const workbook = this.reader.read(bytes);
    const sheet = workbook.sheets[0];

    if (sheet === undefined) {
      throw new UnrecognisedSpreadsheet('That workbook holds no sheets.');
    }

    return interpretSpreadsheet(sheet, {
      referenceDate: LocalDate.fromInstant(this.clock.now()),
      ...(firstColumnYear === undefined ? {} : { firstColumnYear }),
    });
  }

  async apply(
    reading: SpreadsheetReading,
    answers: ImportAnswers,
  ): Promise<ImportReport> {
    const { document, mismatches, notes } = composeBackup(
      reading,
      answers,
      this.clock.now().toISOString(),
      this.holidays,
    );

    await this.backup.restore(document);

    return {
      imported: {
        templates: document.templates.length,
        accounts: document.accounts.length,
        cards: document.cards.length,
        buckets: document.buckets.length,
        months: reading.months.filter(
          (month) => month.month >= answers.fromMonth && !month.isBlank,
        ).length,
      },
      mismatches,
      notes,
    };
  }
}
