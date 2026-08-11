import { describe, expect, it } from 'vitest';

/**
 * The DB-backed suites truncate every table. If they ever run against the
 * development database they destroy data whose only backup is the app's own
 * export, so the setup replaces DATABASE_URL rather than trusting it.
 */
describe('the test database guard', () => {
  it('leaves no database configured, or one named fin_test', () => {
    const url = process.env['DATABASE_URL'] ?? 'postgresql://none/fin_test';

    expect(url).toMatch(/\/fin_test(\?|$)/);
  });
});
