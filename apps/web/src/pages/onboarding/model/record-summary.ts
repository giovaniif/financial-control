import { formatDate, formatMonthLabel } from '@/shared/lib';

const ISO_DAY = /\d{4}-\d{2}-\d{2}/g;
const MONTH_KEY = /\d{4}-\d{2}(?!-)/g;

/**
 * A record comes back written in the user's own terms, but its dates are as
 * the domain writes them: an ISO day, or a bare month for a cycle. The app
 * shows `dd/MM/yyyy` and names a cycle by its month everywhere else, so a
 * record reads the same way.
 *
 * Days are rewritten first — after that no `YYYY-MM` remains inside one, so
 * the month pass cannot take a bite out of a date it has already handled.
 */
export function withLocalDates(summary: string): string {
  return summary
    .replace(ISO_DAY, (iso) => formatDate(iso))
    .replace(MONTH_KEY, (month) => formatMonthLabel(month));
}
