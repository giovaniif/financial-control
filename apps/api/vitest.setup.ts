import { existsSync } from 'node:fs';

// Vitest does not read .env on its own.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

/**
 * The DB-backed tests truncate every table, so they run against their own
 * database and never the development one. `DATABASE_URL` is deliberately
 * replaced rather than read: Prisma reads that variable, so leaving the
 * development URL in place would let a stray client connect to it.
 */
const testUrl = process.env['TEST_DATABASE_URL'];

if (testUrl !== undefined && testUrl !== '') {
  if (!/\/fin_test(\?|$)/.test(testUrl)) {
    throw new Error(
      `TEST_DATABASE_URL must name a database called fin_test — the tests truncate every table in it. Received: ${testUrl}`,
    );
  }
  process.env['DATABASE_URL'] = testUrl;
} else {
  // No test database configured: the DB-backed suites skip themselves rather
  // than fall back to whatever DATABASE_URL happens to point at.
  delete process.env['DATABASE_URL'];
}
