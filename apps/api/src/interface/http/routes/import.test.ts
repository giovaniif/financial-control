import type {
  ImportAnswers,
  ImportReportResponse,
  SpreadsheetReading,
} from '@fin/contracts';
import { describe, expect, it } from 'vitest';

import { ImportSpreadsheet } from '../../../application/import/uc-1-7-import-spreadsheet.js';
import { grid } from '../../../application/import/testing/grid.js';
import { BackupRestore } from '../../../application/backup/uc-1-6-backup-restore.js';
import {
  InMemoryAccountRepository,
  InMemoryBucketRepository,
  InMemoryCardRepository,
  InMemoryCycleRepository,
  InMemorySettingsRepository,
  InMemorySpreadsheetReader,
  InMemoryTemplateRepository,
} from '../../../application/testing/fakes.js';
import { FixedClock } from '../../../application/testing/fixed-clock.js';
import { noHolidays } from '../../../domain/ports/holiday-calendar.js';
import { buildTestServer } from '../testing/test-server.js';

const clock = FixedClock.at('2026-08-10T12:00:00Z');

const sheet = grid({
  A1: 'Setembro',
  A2: 'Convênio',
  B2: -293,
  A14: 'Salário',
  B14: 35000,
  A16: 'Total Gasto',
  B16: ['=SUM(B2:B13)', -293],
  A17: 'Sobra',
  B17: ['=B14+B16', 34707],
  A20: 'Variáveis',
  B20: ['=SUM(B21:B23)', 0],
  A26: 'Sobra Esperada',
  B26: ['=B17+B20', 34707],
});

function importSpreadsheet() {
  const restore = new BackupRestore(
    new InMemoryCycleRepository(),
    new InMemoryAccountRepository(),
    new InMemoryTemplateRepository(),
    new InMemoryCardRepository(),
    new InMemoryBucketRepository(),
    new InMemorySettingsRepository(),
    noHolidays,
    clock,
  );

  return new ImportSpreadsheet(
    new InMemorySpreadsheetReader({ sheets: [sheet] }),
    restore,
    noHolidays,
    clock,
  );
}

/** A multipart body, written out by hand so no client library is involved. */
function upload(bytes: string) {
  const boundary = '----fin';

  return {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="sheet.xlsx"',
      'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '',
      bytes,
      `--${boundary}--`,
      '',
    ].join('\r\n'),
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

describe('POST /import/spreadsheet', () => {
  it('returns what the sheet holds, with the year mapping it inferred', async () => {
    const app = buildTestServer({ importSpreadsheet: importSpreadsheet() });

    const response = await app.inject({
      method: 'POST',
      url: '/import/spreadsheet',
      ...upload('anything'),
    });

    expect(response.statusCode).toBe(200);
    const reading = response.json<SpreadsheetReading>();
    expect(reading.months[0]?.month).toBe('2026-09');
    expect(reading.inference.reasoning).not.toBe('');
    expect(reading.outcomeLabels).toEqual(['Convênio']);
  });

  it('accepts a corrected first year', async () => {
    const app = buildTestServer({ importSpreadsheet: importSpreadsheet() });

    const response = await app.inject({
      method: 'POST',
      url: '/import/spreadsheet?firstColumnYear=2030',
      ...upload('anything'),
    });

    expect(response.json<SpreadsheetReading>().months[0]?.month).toBe(
      '2030-09',
    );
  });

  it('asks for a file when none was attached', async () => {
    const app = buildTestServer({ importSpreadsheet: importSpreadsheet() });

    const response = await app.inject({
      method: 'POST',
      url: '/import/spreadsheet',
      headers: { 'content-type': 'multipart/form-data; boundary=----fin' },
      payload: '------fin--\r\n',
    });

    expect(response.statusCode).toBe(400);
  });

  // A wrong file is a mistake, not a crash: it must never leak a stack trace.
  it('explains a file it cannot read', async () => {
    const app = buildTestServer();

    const response = await app.inject({
      method: 'POST',
      url: '/import/spreadsheet',
      ...upload('not a spreadsheet'),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toMatch(/no sheets|read/i);
  });
});

describe('POST /import/spreadsheet/apply', () => {
  const apply = async (body: unknown) => {
    const app = buildTestServer({ importSpreadsheet: importSpreadsheet() });

    return app.inject({
      method: 'POST',
      url: '/import/spreadsheet/apply',
      payload: body as Record<string, unknown>,
    });
  };

  const read = () => importSpreadsheet().read(new Uint8Array());

  it('returns the report rather than an empty success', async () => {
    const response = await apply({ reading: read(), answers });

    expect(response.statusCode).toBe(200);
    const report = response.json<ImportReportResponse>();
    expect(report.imported).toEqual({
      templates: 2,
      accounts: 1,
      cards: 0,
      buckets: 0,
      months: 1,
    });
    expect(report.mismatches).toEqual([]);
  });

  it('rejects a body missing either half', async () => {
    const response = await apply({ reading: read() });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toMatch(/both required/);
  });

  it('names what the answers are still missing', async () => {
    const response = await apply({
      reading: read(),
      answers: { ...answers, dueDays: {} },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toMatch(/Convênio/);
  });

  // With pay on the 31st the September 2026 cycle runs 31 Aug – 29 Sep, so
  // day 30 exists in neither month it spans and would generate nothing.
  it('explains a due day the cycle never reaches', async () => {
    const response = await apply({
      reading: read(),
      answers: {
        ...answers,
        anchor: { anchorDay: 31, shiftPolicy: 'PRECEDING' },
        dueDays: { Convênio: 30, Salário: 5 },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toMatch(/never reaches/);
  });
});
