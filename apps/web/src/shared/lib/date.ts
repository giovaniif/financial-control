/**
 * Dates render as `dd/MM/yyyy` and cycle ranges as `5 Aug – 3 Sep`. Formatting
 * is locale, not language: the app is English, the conventions are Brazilian.
 */
const full = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});

// `en-GB` renders September as "Sept" and every other month with three
// letters. Cycle ranges sit in tight header space and read as a set, so the
// months are cut to three characters for a uniform width.
const short = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

// A cycle month is written `2026-10` and read back as the name the rest of
// the app calls that cycle by.
const monthName = new Intl.DateTimeFormat('en-GB', {
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
  const [day, month] = short.format(parse(iso)).split(' ');

  return `${String(day)} ${String(month).slice(0, 3)}`;
}

/**
 * A cycle's bounds, always stated: a range is never shown as a bare month
 * name, or the whole payday-cycle model becomes confusing.
 */
export function formatRange(startIso: string, endIso: string): string {
  return `${formatDayMonth(startIso)} – ${formatDayMonth(endIso)}`;
}

/** `2026-10` → `October 2026`. A cycle is named for the month it is spent in. */
export function formatMonthLabel(month: string): string {
  return monthName.format(parse(`${month}-01`));
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
