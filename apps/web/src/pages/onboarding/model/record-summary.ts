import { formatDate } from '@/shared/lib';

const ISO_DAY = /\d{4}-\d{2}-\d{2}/g;

/**
 * A record comes back written in the user's own terms, but any date in it is
 * an ISO day — that is how the domain speaks. The app shows dates as
 * `dd/MM/yyyy` everywhere else, so a record reads the same way too.
 */
export function withLocalDates(summary: string): string {
  return summary.replace(ISO_DAY, (iso) => formatDate(iso));
}
