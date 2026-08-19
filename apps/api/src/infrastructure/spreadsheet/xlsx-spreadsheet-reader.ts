import { XMLParser } from 'fast-xml-parser';
import { unzipSync, strFromU8 } from 'fflate';

import type {
  Cell,
  SheetGrid,
  SpreadsheetReader,
  Workbook,
} from '../../domain/ports/spreadsheet-reader.js';
import { UnreadableSpreadsheet } from '../../domain/ports/spreadsheet-reader.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  // A single row or cell would otherwise arrive as an object rather than an
  // array of one, and every caller would need to handle both shapes.
  isArray: (name) => ['row', 'c', 'si', 'sheet'].includes(name),
});

/**
 * An xlsx is a zip of XML. This is the only file allowed to know that: above
 * the port, a workbook is a map from cell reference to value and formula.
 */
export class XlsxSpreadsheetReader implements SpreadsheetReader {
  read(bytes: Uint8Array): Workbook {
    const files = unzip(bytes);
    const shared = readSharedStrings(files);
    const names = readSheetNames(files);

    const sheets = names.map((name, index) => {
      const xml = files[`xl/worksheets/sheet${String(index + 1)}.xml`];

      return readSheet(name, xml, shared);
    });

    if (sheets.length === 0) {
      throw new UnreadableSpreadsheet('That file holds no sheets.');
    }
    return { sheets };
  }
}

function unzip(bytes: Uint8Array): Record<string, Uint8Array> {
  try {
    return unzipSync(bytes);
  } catch {
    throw new UnreadableSpreadsheet(
      'That file could not be read as a spreadsheet. Export it as .xlsx and try again.',
    );
  }
}

function parse(xml: Uint8Array): unknown {
  try {
    return parser.parse(strFromU8(xml));
  } catch {
    throw new UnreadableSpreadsheet('That spreadsheet is damaged.');
  }
}

function readSharedStrings(files: Record<string, Uint8Array>): string[] {
  const xml = files['xl/sharedStrings.xml'];
  if (xml === undefined) {
    return [];
  }

  const items = at(at(parse(xml), 'sst'), 'si');

  return Array.isArray(items) ? items.map(textOf) : [];
}

function readSheetNames(files: Record<string, Uint8Array>): string[] {
  const xml = files['xl/workbook.xml'];
  if (xml === undefined) {
    throw new UnreadableSpreadsheet('That file is not a spreadsheet.');
  }

  const sheets = at(at(at(parse(xml), 'workbook'), 'sheets'), 'sheet');
  if (!Array.isArray(sheets)) {
    return [];
  }

  return sheets.map((sheet, index) => {
    const name = at(sheet, '@name');

    return typeof name === 'string' ? name : `Sheet${String(index + 1)}`;
  });
}

function readSheet(
  name: string,
  xml: Uint8Array | undefined,
  shared: string[],
): SheetGrid {
  const cells = new Map<string, Cell>();
  if (xml === undefined) {
    return { name, cells };
  }

  const rows = at(at(at(parse(xml), 'worksheet'), 'sheetData'), 'row');
  if (!Array.isArray(rows)) {
    return { name, cells };
  }

  for (const row of rows) {
    const cellNodes = at(row, 'c');
    if (!Array.isArray(cellNodes)) {
      continue;
    }
    for (const node of cellNodes) {
      const ref = at(node, '@r');
      if (typeof ref === 'string') {
        cells.set(ref, toCell(node, shared));
      }
    }
  }

  return { name, cells };
}

function toCell(node: unknown, shared: string[]): Cell {
  const formula = at(node, 'f');
  const raw = at(node, 'v');
  const type = at(node, '@t');

  const value =
    type === 's'
      ? (shared[Number(raw)] ?? null)
      : type === 'inlineStr'
        ? textOf(at(node, 'is'))
        : ((raw as string | number | undefined) ?? null);

  return typeof formula === 'string' || typeof formula === 'number'
    ? { value, formula: String(formula) }
    : { value };
}

/** The concatenated text of an `si` or `is` node, runs included. */
function textOf(node: unknown): string {
  const text = at(node, 't');
  if (typeof text === 'string' || typeof text === 'number') {
    return String(text);
  }

  const runs = at(node, 'r');
  if (Array.isArray(runs)) {
    return runs.map(textOf).join('');
  }
  return '';
}

function at(node: unknown, key: string): unknown {
  if (typeof node !== 'object' || node === null) {
    return undefined;
  }
  return (node as Record<string, unknown>)[key];
}
