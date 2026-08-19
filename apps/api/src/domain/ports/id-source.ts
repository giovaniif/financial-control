/**
 * Where a new identifier comes from. Nothing in `domain/` or `application/`
 * calls `crypto.randomUUID()` directly, for the same reason nothing calls
 * `new Date()`: an id invented inside an interactor cannot be asserted on, so
 * the test has to reach for whatever the code happened to generate.
 */
export interface IdSource {
  next(): string;
}
