/**
 * Dates render as `dd/MM/yyyy` and cycle ranges as `5 ago – 3 set`. Both the
 * conventions and the words are Brazilian: a month name is copy, so it is
 * pt-BR like the rest of what a person reads.
 */
const full = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});

// pt-BR abbreviates a month as "out." — the trailing point and the "de" are
// dropped below, since a range sits in tight header space and reads as a set.
const short = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

// A cycle month is written `2026-10` and read back as the name the rest of
// the app calls that cycle by.
const monthName = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** An ISO calendar day, read as UTC so it cannot shift a day either way. */
function parse(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function formatDate(iso: string): string {
  return full.format(parse(iso));
}

export function formatDayMonth(iso: string): string {
  // Read from the parts rather than the formatted string: pt-BR writes
  // "5 de out.", so splitting on spaces would take "de" for the month.
  const parts = short.formatToParts(parse(iso));
  const day = parts.find((part) => part.type === 'day')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';

  return `${day} ${month.replace('.', '').slice(0, 3)}`;
}

/**
 * A cycle's bounds, always stated: a range is never shown as a bare month
 * name, or the whole payday-cycle model becomes confusing.
 */
export function formatRange(startIso: string, endIso: string): string {
  return `${formatDayMonth(startIso)} – ${formatDayMonth(endIso)}`;
}

/**
 * `2026-10` → `Outubro de 2026`. A cycle is named for the month it is spent
 * in. Capitalised to match the label the server writes for the same cycle;
 * pt-BR lowercases month names and the two must not disagree.
 */
export function formatMonthLabel(month: string): string {
  const label = monthName.format(parse(`${month}-01`));

  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * The month a full date falls in, named the way a cycle is: a goal's target
 * date is a day, but a goal is answered in months.
 */
export function formatMonthOf(iso: string): string {
  return formatMonthLabel(iso.slice(0, 7));
}

/**
 * Cycle arithmetic on a month key. A projection counts in cycles from the one
 * on screen, and one cycle is one month — `2026-08` plus 55 is `2031-03`.
 */
export function shiftMonth(month: string, by: number): string {
  const [year = 0, index = 1] = month.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, index - 1 + by, 1));

  return `${String(shifted.getUTCFullYear())}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Today, as `YYYY-MM-DD` in the machine's own timezone.
 *
 * Built from the local parts rather than `toISOString`, which is UTC: an
 * evening in Brazil is already tomorrow in UTC, and a correction stamped with
 * tomorrow's date would sort ahead of events that actually followed it.
 */
export function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${String(now.getFullYear())}-${month}-${day}`;
}
