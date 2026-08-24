/**
 * The width at which the nav, the chat and a readable column of figures fit
 * side by side. Below it the shell is a different layout rather than a
 * narrower one: the nav becomes a drawer and the chat becomes a sheet.
 *
 * It is one query and not two because the three parts compete for the same
 * width — a nav that folds at one size and a chat that folds at another would
 * leave a band where neither fits.
 */
export const WIDE_ENOUGH_FOR_SHELL = '(min-width: 64rem)';
