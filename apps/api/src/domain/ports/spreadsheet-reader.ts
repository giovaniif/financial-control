import { DomainError } from '../shared/domain-error.js';

export class UnreadableSpreadsheet extends DomainError {}

/**
 * One cell. The formula matters as much as the value: `=AJ26*0.2` says the
 * allocation rule is 20% of Expected Surplus, and the computed number alone
 * has lost that.
 */
export interface Cell {
  readonly value: string | number | null;
  readonly formula?: string;
}

/** A sheet as a sparse map from `A1`-style reference to cell. */
export interface SheetGrid {
  readonly name: string;
  readonly cells: ReadonlyMap<string, Cell>;
}

export interface Workbook {
  readonly sheets: readonly SheetGrid[];
}

/**
 * Reads a spreadsheet into plain data. Declared here so the interpretation
 * above it stays pure; the parsing library lives in infrastructure and is
 * never visible from the domain.
 */
export interface SpreadsheetReader {
  read(bytes: Uint8Array): Workbook;
}
