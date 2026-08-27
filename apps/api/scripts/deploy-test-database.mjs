// Prepares fin_test from the committed migrations.
//
// `db:migrate` and `db:deploy` both target DATABASE_URL, which is the
// development database — so nothing in the repo ever built the test one, and
// its schema survived only as whatever an old volume happened to carry. When
// that volume was replaced the schema went with it, and 42 repository tests
// failed naming a missing table rather than a missing database.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

const url = process.env['TEST_DATABASE_URL'];

if (url === undefined || url === '') {
  console.error(
    'TEST_DATABASE_URL is not set. It names the database the DB-backed tests run against.',
  );
  process.exit(1);
}

// The same guard vitest.setup.ts applies, for the same reason: these tests
// truncate every table, so pointing them at the development database would
// destroy data whose only backup is a dump.
if (!/\/fin_test(\?|$)/.test(url)) {
  console.error(
    `TEST_DATABASE_URL must name a database called fin_test — the tests truncate every table in it. Received: ${url}`,
  );
  process.exit(1);
}

execFileSync('prisma', ['migrate', 'deploy'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: url },
});
