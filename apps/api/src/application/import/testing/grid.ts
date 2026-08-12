import type {
  Cell,
  SheetGrid,
} from '../../../domain/ports/spreadsheet-reader.js';

/**
 * A sheet written as `{ A1: 'Agosto', B1: -293 }`, or `['=SUM(B2:B13)', -12]`
 * for a cell that carries a formula as well as a value.
 */
export type GridSpec = Record<
  string,
  string | number | null | [string, number]
>;

export function grid(spec: GridSpec, name = 'Controle Financeiro'): SheetGrid {
  const cells = new Map<string, Cell>();

  for (const [ref, entry] of Object.entries(spec)) {
    cells.set(ref, toCell(entry));
  }
  return { name, cells };
}

function toCell(entry: string | number | null | [string, number]): Cell {
  if (Array.isArray(entry)) {
    const [formula, value] = entry;
    return { value, formula: formula.replace(/^=/, '') };
  }
  return { value: entry };
}
