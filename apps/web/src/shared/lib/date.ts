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
