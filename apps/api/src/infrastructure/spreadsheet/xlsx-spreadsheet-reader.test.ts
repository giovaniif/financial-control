import { describe, expect, it } from 'vitest';

import { UnreadableSpreadsheet } from '../../domain/ports/spreadsheet-reader.js';
import { buildWorkbook } from './testing/build-workbook.js';
import { XlsxSpreadsheetReader } from './xlsx-spreadsheet-reader.js';

const reader = new XlsxSpreadsheetReader();

describe('XlsxSpreadsheetReader', () => {
  it('reads shared strings, numbers and inline strings', () => {
    const bytes = buildWorkbook(
      [
        {
          name: 'Controle Financeiro',
          cells: [
            { ref: 'A1', value: 0, type: 's' },
            { ref: 'B1', value: -293 },
            { ref: 'C1', value: 'Claro', type: 'inlineStr' },
          ],
        },
      ],
      ['Convênio'],
    );

    const [sheet] = reader.read(bytes).sheets;

    expect(sheet?.cells.get('A1')).toEqual({ value: 'Convênio' });
    expect(sheet?.cells.get('B1')).toEqual({ value: -293 });
    expect(sheet?.cells.get('C1')).toEqual({ value: 'Claro' });
  });

  /**
   * The formula is what carries intent the computed value has lost: `=AJ26*0.2`
   * says the allocation rule is 20% of Expected Surplus.
   */
  it('exposes the formula behind a cell', () => {
    const bytes = buildWorkbook([
      {
        name: 'Sheet1',
        cells: [{ ref: 'AJ28', value: 3409.672, formula: 'AJ26*0.2' }],
      },
    ]);

    const [sheet] = reader.read(bytes).sheets;

    expect(sheet?.cells.get('AJ28')).toEqual({
      value: 3409.672,
      formula: 'AJ26*0.2',
    });
  });

  it('treats a cell with no value as blank rather than absent', () => {
    const bytes = buildWorkbook([
      { name: 'Sheet1', cells: [{ ref: 'A1' }, { ref: 'A2', value: 1 }] },
    ]);

    const [sheet] = reader.read(bytes).sheets;

    expect(sheet?.cells.get('A1')).toEqual({ value: null });
    expect(sheet?.cells.has('A3')).toBe(false);
  });

  it('keeps each sheet under its own name', () => {
    const bytes = buildWorkbook([
      { name: 'Controle Financeiro', cells: [{ ref: 'A1', value: 1 }] },
      { name: 'Controle Financeiro - OLD', cells: [{ ref: 'A1', value: 2 }] },
    ]);

    const { sheets } = reader.read(bytes);

    expect(sheets.map((sheet) => sheet.name)).toEqual([
      'Controle Financeiro',
      'Controle Financeiro - OLD',
    ]);
    expect(sheets[1]?.cells.get('A1')?.value).toBe(2);
  });

  it('reads a workbook with no shared strings part', () => {
    const bytes = buildWorkbook([
      { name: 'Sheet1', cells: [{ ref: 'A1', value: 42 }] },
    ]);

    expect(reader.read(bytes).sheets[0]?.cells.get('A1')?.value).toBe(42);
  });

  // A wrong file is a user mistake, not a crash: it has to arrive as something
  // the interface layer can turn into a 400.
  it('rejects bytes that are not a spreadsheet', () => {
    expect(() => reader.read(new TextEncoder().encode('not a zip'))).toThrow(
      UnreadableSpreadsheet,
    );
  });

  it('rejects a zip that is not a workbook', () => {
    const bytes = buildWorkbook([]);

    expect(() => reader.read(bytes)).toThrow(UnreadableSpreadsheet);
  });
});
