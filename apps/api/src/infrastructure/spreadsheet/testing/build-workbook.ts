import { zipSync, strToU8 } from 'fflate';

interface CellSpec {
  ref: string;
  /** A shared-string index (`s`), an inline number, or a literal. */
  value?: string | number;
  type?: 's' | 'inlineStr';
  formula?: string;
}

interface SheetSpec {
  name: string;
  cells: CellSpec[];
}

/**
 * A minimal but real xlsx, built rather than committed as a binary so the
 * fixture is reviewable and the reader is tested against known bytes.
 */
export function buildWorkbook(
  sheets: SheetSpec[],
  sharedStrings: string[] = [],
): Uint8Array {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(contentTypes(sheets.length)),
    '_rels/.rels': strToU8(rootRels()),
    'xl/workbook.xml': strToU8(workbook(sheets)),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRels(sheets.length)),
    'xl/sharedStrings.xml': strToU8(strings(sharedStrings)),
  };

  sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${String(index + 1)}.xml`] = strToU8(
      worksheet(sheet),
    );
  });

  return zipSync(files);
}

function contentTypes(count: number): string {
  const overrides = Array.from(
    { length: count },
    (_, index) =>
      `<Override PartName="/xl/worksheets/sheet${String(index + 1)}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join('');

  return `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}</Types>`;
}

function rootRels(): string {
  return `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
}

function workbook(sheets: SheetSpec[]): string {
  const entries = sheets
    .map(
      (sheet, index) =>
        `<sheet name="${sheet.name}" sheetId="${String(index + 1)}" r:id="rId${String(index + 1)}"/>`,
    )
    .join('');

  return `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${entries}</sheets></workbook>`;
}

function workbookRels(count: number): string {
  const entries = Array.from(
    { length: count },
    (_, index) =>
      `<Relationship Id="rId${String(index + 1)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${String(index + 1)}.xml"/>`,
  ).join('');

  return `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${entries}</Relationships>`;
}

function strings(values: string[]): string {
  const items = values.map((value) => `<si><t>${value}</t></si>`).join('');

  return `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${String(values.length)}">${items}</sst>`;
}

function worksheet(sheet: SheetSpec): string {
  const byRow = new Map<number, CellSpec[]>();
  for (const cell of sheet.cells) {
    const row = Number(/\d+/.exec(cell.ref)?.[0] ?? 0);
    byRow.set(row, [...(byRow.get(row) ?? []), cell]);
  }

  const rows = [...byRow.entries()]
    .sort(([a], [b]) => a - b)
    .map(([row, cells]) => {
      const body = cells.map(renderCell).join('');
      return `<row r="${String(row)}">${body}</row>`;
    })
    .join('');

  return `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
}

function renderCell(cell: CellSpec): string {
  const type = cell.type === undefined ? '' : ` t="${cell.type}"`;
  const formula =
    cell.formula === undefined ? '' : `<f>${escape(cell.formula)}</f>`;

  if (cell.value === undefined) {
    return `<c r="${cell.ref}"${type}>${formula}</c>`;
  }
  if (cell.type === 'inlineStr') {
    return `<c r="${cell.ref}"${type}>${formula}<is><t>${String(cell.value)}</t></is></c>`;
  }
  return `<c r="${cell.ref}"${type}>${formula}<v>${String(cell.value)}</v></c>`;
}

function escape(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
}
