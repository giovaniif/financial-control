/**
 * The only way anything in this codebase learns the current time. Nothing in
 * `domain/` or `application/` may call `new Date()` — untestable time is the
 * most common cause of flaky tests, and every cycle boundary depends on dates.
 */
export interface Clock {
  now(): Date;
}
