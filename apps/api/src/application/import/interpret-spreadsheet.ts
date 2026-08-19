import type {
  BucketReading,
  DerivedFigures,
  MonthReading,
  NamedAmount,
  ReadRule,
  SpreadsheetReading,
} from '@fin/contracts';

import { DomainError } from '../../domain/shared/domain-error.js';
import type { LocalDate } from '../../domain/shared/local-date.js';
import type { Cell, SheetGrid } from '../../domain/ports/spreadsheet-reader.js';

export class UnrecognisedSpreadsheet extends DomainError {}

export type {
  BucketReading,
  DerivedFigures,
  MonthReading,
  NamedAmount,
  ReadRule,
  SpreadsheetReading,
};

export interface InterpretOptions {
  referenceDate: LocalDate;
  /** Overrides the inferred year of the leftmost column. */
  firstColumnYear?: number;
}

const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const TOTAL_OUTCOME = 'Total Gasto';
const SURPLUS = 'Sobra';
const VARIABLES = 'Variáveis';
const EXPECTED_SURPLUS = 'Sobra Esperada';
const NET_SURPLUS = 'Sobra Real';
const SALARY = 'Salário';
/** A running balance sits on `<bucket> Real`, beside its allocation row. */
const BALANCE_SUFFIX = ' Real';

const MISSING = [
  'The payday anchor — the sheet holds no dates at all.',
  'A due day for every bill, which is what gives the ledger a running balance.',
  'Which of the outcome rows are credit cards, and their closing day, due day and limit.',
  'The accounts money sits in, and their balances.',
  'Whether each bucket is a goal or ongoing, and a goal’s target and target date.',
];

interface MonthColumn {
  monthName: string;
  monthNumber: number;
  labelColumn: number;
  amountColumn: number;
}

interface DatedColumn extends MonthColumn {
  /** Years past the leftmost column, from where the month numbers wrap. */
  yearOffset: number;
}

/**
 * Reads the "Controle Financeiro" spreadsheet into everything it actually
 * knows, and nothing it does not.
 *
 * Two rules govern the whole thing. **Nothing is keyed on a row number** — a
 * bill moves rows partway across the sheet, so labels are the key. And the
 * block boundaries come from the sheet's own SUM formulas rather than from
 * constants here, so a sheet that grows a row stays readable.
 */
export function interpretSpreadsheet(
  sheet: SheetGrid,
  options: InterpretOptions,
): SpreadsheetReading {
  const columns = withYearOffsets(readMonthColumns(sheet));
  if (columns.length === 0) {
    throw new UnrecognisedSpreadsheet(
      'No month columns found. The first row should name the months in Portuguese, one per pair of columns.',
    );
  }

  const inference = inferYears(columns, options);
  const rows = readLayout(sheet, columns);
  const warnings = strayAmounts(sheet, columns, rows);

  const months = columns.map((column) =>
    readMonth(sheet, column, rows, monthOf(inference.firstColumnYear, column)),
  );

  return {
    months,
    outcomeLabels: distinctLabels(sheet, columns, rows.outcomes),
    buckets: readBuckets(sheet, columns, rows, months),
    inference,
    missing: MISSING,
    warnings,
  };
}

/** Row 1 names the months, one per column pair: label in `n`, amount in `n+1`. */
function readMonthColumns(sheet: SheetGrid): MonthColumn[] {
  const found: MonthColumn[] = [];

  for (const [ref, cell] of sheet.cells) {
    const { column, row } = parseRef(ref);
    if (row !== 1 || typeof cell.value !== 'string') {
      continue;
    }
    const monthNumber = MONTHS.indexOf(cell.value.trim()) + 1;
    if (monthNumber > 0) {
      found.push({
        monthName: cell.value.trim(),
        monthNumber,
        labelColumn: column,
        amountColumn: column + 1,
      });
    }
  }

  return found.sort((a, b) => a.labelColumn - b.labelColumn);
}

/**
 * The sheet names months but never years. They run consecutively left to
 * right, so only one year needs deciding: the rest follow from where the month
 * numbers wrap. It is anchored on the *last* column naming the reference
 * month, because the sheet is kept ahead of today rather than behind it.
 */
function inferYears(
  columns: DatedColumn[],
  { referenceDate, firstColumnYear }: InterpretOptions,
): { firstColumnYear: number; reasoning: string } {
  if (firstColumnYear !== undefined) {
    return {
      firstColumnYear,
      reasoning: `First column set to ${String(firstColumnYear)}.`,
    };
  }

  const anchor = columns.findLast(
    (column) => column.monthNumber === referenceDate.month,
  );

  if (anchor === undefined) {
    return {
      firstColumnYear: referenceDate.year,
      reasoning: `No column names the month we are in, so the first column was assumed to be ${String(referenceDate.year)}. Correct it if that is wrong.`,
    };
  }

  const first = referenceDate.year - anchor.yearOffset;

  return {
    firstColumnYear: first,
    reasoning: `Today is in ${anchor.monthName} ${String(referenceDate.year)}, and the last ${anchor.monthName} column was read as ${anchor.monthName} ${String(referenceDate.year)}. That puts the first column in ${String(first)}.`,
  };
}

/** Each column with how many years past the first column it sits. */
function withYearOffsets(columns: MonthColumn[]): DatedColumn[] {
  let offset = 0;

  return columns.map((column, index) => {
    const previous = columns[index - 1];
    if (previous !== undefined && column.monthNumber <= previous.monthNumber) {
      offset += 1;
    }
    return { ...column, yearOffset: offset };
  });
}

function monthOf(
  firstYear: number,
  column: DatedColumn,
): { month: string; monthName: string } {
  const year = firstYear + column.yearOffset;
  const month = String(column.monthNumber).padStart(2, '0');

  return { month: `${String(year)}-${month}`, monthName: column.monthName };
}

interface Layout {
  outcomes: number[];
  variables: number[];
  allocations: number[];
  salaryRow: number | undefined;
  derivedRows: Record<string, number | undefined>;
}

/**
 * Where each block of rows is, taken from the spreadsheet's own formulas:
 * `Total Gasto` sums the outcomes, `Variáveis` sums the one-offs, and
 * `Sobra Real` names every allocation row it subtracts.
 */
function readLayout(sheet: SheetGrid, columns: MonthColumn[]): Layout {
  const labelRow = (label: string) => findRow(sheet, columns, label);

  const derivedRows: Record<string, number | undefined> = {
    [TOTAL_OUTCOME]: labelRow(TOTAL_OUTCOME),
    [SURPLUS]: labelRow(SURPLUS),
    [VARIABLES]: labelRow(VARIABLES),
    [EXPECTED_SURPLUS]: labelRow(EXPECTED_SURPLUS),
    [NET_SURPLUS]: labelRow(NET_SURPLUS),
  };

  return {
    outcomes: sumRange(sheet, columns, derivedRows[TOTAL_OUTCOME]),
    variables: sumRange(sheet, columns, derivedRows[VARIABLES]),
    allocations: subtractedRows(sheet, columns, derivedRows[NET_SURPLUS]),
    salaryRow: labelRow(SALARY),
    derivedRows,
  };
}

/** The first row carrying `label` in any month column's label column. */
function findRow(
  sheet: SheetGrid,
  columns: MonthColumn[],
  label: string,
): number | undefined {
  let found: number | undefined;

  for (const [ref, cell] of sheet.cells) {
    const { column, row } = parseRef(ref);
    const isLabelColumn = columns.some(
      (candidate) => candidate.labelColumn === column,
    );
    if (
      isLabelColumn &&
      typeof cell.value === 'string' &&
      cell.value.trim() === label &&
      (found === undefined || row < found)
    ) {
      found = row;
    }
  }
  return found;
}

/**
 * The rows a `SUM(B2:B13)` formula covers, widened across every column: a
 * block that grew a row partway along the sheet is still one block.
 */
function sumRange(
  sheet: SheetGrid,
  columns: MonthColumn[],
  row: number | undefined,
): number[] {
  const bounds = formulasAt(sheet, columns, row).flatMap((formula) => {
    const match = /SUM\([A-Z]+(\d+):[A-Z]+(\d+)\)/i.exec(formula);

    return match === null
      ? []
      : [{ from: Number(match[1]), to: Number(match[2]) }];
  });

  if (bounds.length === 0) {
    return [];
  }
  const from = Math.min(...bounds.map((bound) => bound.from));
  const to = Math.max(...bounds.map((bound) => bound.to));

  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

/**
 * The rows a `=D26-D28-D29` formula subtracts — the allocations. Taken as the
 * union across every column, because a bucket added halfway along the sheet
 * only appears in the formulas from that column onward.
 */
function subtractedRows(
  sheet: SheetGrid,
  columns: MonthColumn[],
  row: number | undefined,
): number[] {
  const rows = formulasAt(sheet, columns, row).flatMap((formula) =>
    [...formula.matchAll(/-\s*[A-Z]+(\d+)/g)].map((match) => Number(match[1])),
  );

  return [...new Set(rows)].sort((a, b) => a - b);
}

function formulasAt(
  sheet: SheetGrid,
  columns: MonthColumn[],
  row: number | undefined,
): string[] {
  if (row === undefined) {
    return [];
  }

  return columns.flatMap((column) => {
    const formula = sheet.cells.get(
      `${toColumnName(column.amountColumn)}${String(row)}`,
    )?.formula;

    return formula === undefined ? [] : [formula];
  });
}

function readMonth(
  sheet: SheetGrid,
  column: MonthColumn,
  rows: Layout,
  named: { month: string; monthName: string },
): MonthReading {
  const pairs = (block: number[]) =>
    block
      .map((row) => readPair(sheet, column, row))
      .filter((pair): pair is NamedAmount => pair !== undefined);

  const derivedAt = (label: string) => {
    const row = rows.derivedRows[label];
    return row === undefined ? null : (amountAt(sheet, column, row) ?? null);
  };

  const outcomes = pairs(rows.outcomes);
  const variables = pairs(rows.variables);
  const allocations = pairs(rows.allocations);
  const balances = allocations
    .map((allocation) =>
      readBalance(sheet, column, `${allocation.label}${BALANCE_SUFFIX}`),
    )
    .filter((pair): pair is NamedAmount => pair !== undefined);

  const salary =
    rows.salaryRow === undefined
      ? null
      : (amountAt(sheet, column, rows.salaryRow) ?? null);

  return {
    ...named,
    isBlank:
      salary === null &&
      [outcomes, variables, allocations].every((block) => block.length === 0),
    salary,
    outcomes,
    variables,
    allocations,
    balances,
    derived: {
      totalOutcome: derivedAt(TOTAL_OUTCOME),
      surplus: derivedAt(SURPLUS),
      expectedSurplus: derivedAt(EXPECTED_SURPLUS),
      netSurplus: derivedAt(NET_SURPLUS),
    },
  };
}

/** A label and its amount, or nothing when the column has neither. */
function readPair(
  sheet: SheetGrid,
  column: MonthColumn,
  row: number,
): NamedAmount | undefined {
  const label = sheet.cells.get(
    `${toColumnName(column.labelColumn)}${String(row)}`,
  )?.value;
  const amount = amountAt(sheet, column, row);

  if (
    typeof label !== 'string' ||
    label.trim() === '' ||
    amount === undefined
  ) {
    return undefined;
  }
  return { label: label.trim(), amount };
}

function readBalance(
  sheet: SheetGrid,
  column: MonthColumn,
  label: string,
): NamedAmount | undefined {
  const row = findRowByLabel(sheet, column, label);

  if (row === undefined) {
    return undefined;
  }
  const amount = amountAt(sheet, column, row);

  return amount === undefined ? undefined : { label, amount };
}

function findRowByLabel(
  sheet: SheetGrid,
  column: MonthColumn,
  label: string,
): number | undefined {
  for (const [ref, cell] of sheet.cells) {
    const parsed = parseRef(ref);
    if (
      parsed.column === column.labelColumn &&
      typeof cell.value === 'string' &&
      cell.value.trim() === label
    ) {
      return parsed.row;
    }
  }
  return undefined;
}

function amountAt(
  sheet: SheetGrid,
  column: MonthColumn,
  row: number,
): number | undefined {
  const cell = sheet.cells.get(
    `${toColumnName(column.amountColumn)}${String(row)}`,
  );

  return toCents(cell);
}

/**
 * Reais to integer cents. Rounding, never truncation: the accumulated float
 * drift in the spreadsheet is the specific failure this app exists to end.
 */
function toCents(cell: Cell | undefined): number | undefined {
  const value = cell?.value;
  if (typeof value === 'number') {
    return Math.round(value * 100);
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined;
  }
  return undefined;
}

function distinctLabels(
  sheet: SheetGrid,
  columns: MonthColumn[],
  rows: number[],
): string[] {
  const labels = new Set<string>();

  for (const row of rows) {
    for (const column of columns) {
      const value = sheet.cells.get(
        `${toColumnName(column.labelColumn)}${String(row)}`,
      )?.value;
      if (typeof value === 'string' && value.trim() !== '') {
        labels.add(value.trim());
      }
    }
  }
  return [...labels];
}

function readBuckets(
  sheet: SheetGrid,
  columns: MonthColumn[],
  rows: Layout,
  months: MonthReading[],
): BucketReading[] {
  return rows.allocations.flatMap((row) => {
    const name = labelOf(sheet, columns, row);
    if (name === undefined) {
      return [];
    }

    const balances = months
      .flatMap((month) => month.balances)
      .filter((balance) => balance.label === `${name}${BALANCE_SUFFIX}`);

    return [
      {
        name,
        rule: readRule(sheet, columns, row),
        latestBalance: balances.at(-1)?.amount ?? null,
        balanceWasOverwritten: hasOverwrittenBalance(sheet, columns, name),
      },
    ];
  });
}

/**
 * `=AJ26*0.2` is the allocation rule stated exactly: 20% of Expected Surplus.
 * Without a formula only the computed number survives, which can be read as a
 * fixed amount but not as a share.
 */
function readRule(
  sheet: SheetGrid,
  columns: MonthColumn[],
  row: number,
): ReadRule | null {
  for (const column of [...columns].reverse()) {
    const cell = sheet.cells.get(
      `${toColumnName(column.amountColumn)}${String(row)}`,
    );
    const share = /^[A-Z]+\d+\s*\*\s*([\d.]+)$/i.exec(cell?.formula ?? '');
    if (share !== null) {
      return { kind: 'PERCENT', percent: Number(share[1]) * 100 };
    }
    const amount = toCents(cell);
    if (amount !== undefined && amount !== 0 && cell?.formula === undefined) {
      return { kind: 'FIXED', amount };
    }
  }
  return null;
}

function labelOf(
  sheet: SheetGrid,
  columns: MonthColumn[],
  row: number,
): string | undefined {
  for (const column of columns) {
    const value = sheet.cells.get(
      `${toColumnName(column.labelColumn)}${String(row)}`,
    )?.value;
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }
  return undefined;
}

/**
 * A running balance should be the previous one plus this cycle's allocation.
 * A literal number in that formula is a balance typed over the total, and the
 * history behind it is gone.
 */
function hasOverwrittenBalance(
  sheet: SheetGrid,
  columns: MonthColumn[],
  name: string,
): boolean {
  const label = `${name}${BALANCE_SUFFIX}`;

  return columns.some((column) => {
    const row = findRowByLabel(sheet, column, label);
    if (row === undefined) {
      return false;
    }
    const formula = sheet.cells.get(
      `${toColumnName(column.amountColumn)}${String(row)}`,
    )?.formula;

    return formula !== undefined && /(^|[+\-*(,])\s*\d+(\.\d+)?/.test(formula);
  });
}

/**
 * Amounts sitting outside every block the sheet totals. They are real numbers
 * the spreadsheet's own arithmetic ignores, so importing them silently would
 * change the figures rather than reproduce them.
 */
function strayAmounts(
  sheet: SheetGrid,
  columns: MonthColumn[],
  rows: Layout,
): string[] {
  const counted = new Set([
    ...rows.outcomes,
    ...rows.variables,
    ...rows.allocations,
    ...Object.values(rows.derivedRows).filter(
      (row): row is number => row !== undefined,
    ),
    rows.salaryRow,
    1,
  ]);

  const stray = new Set<string>();
  for (const column of columns) {
    for (const [ref, cell] of sheet.cells) {
      const { column: at, row } = parseRef(ref);
      if (at !== column.amountColumn || counted.has(row)) {
        continue;
      }
      const label = labelOf(sheet, columns, row);
      const isBalance = label?.endsWith(BALANCE_SUFFIX) ?? false;
      if (label !== undefined && !isBalance && toCents(cell) !== undefined) {
        stray.add(label);
      }
    }
  }

  return stray.size === 0
    ? []
    : [
        `${[...stray].join(', ')} carr${stray.size === 1 ? 'ies an amount' : 'y amounts'} the spreadsheet's own totals do not include. Check whether they belong.`,
      ];
}

function parseRef(ref: string): { column: number; row: number } {
  const match = /^([A-Z]+)(\d+)$/.exec(ref);
  const letters = match?.[1];
  const digits = match?.[2];

  if (letters === undefined || digits === undefined) {
    return { column: -1, row: -1 };
  }
  return { column: toColumnNumber(letters), row: Number(digits) };
}

function toColumnNumber(name: string): number {
  let column = 0;

  for (let index = 0; index < name.length; index += 1) {
    column = column * 26 + (name.charCodeAt(index) - 64);
  }
  return column;
}

function toColumnName(column: number): string {
  let name = '';
  let remaining = column;

  while (remaining > 0) {
    const remainder = (remaining - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    remaining = Math.floor((remaining - remainder) / 26);
  }
  return name;
}
