import { existsSync } from 'node:fs';

// Vitest does not read .env on its own. The DB-backed repository tests skip
// themselves when DATABASE_URL is absent, so loading it here is what decides
// whether they run — see prisma-repositories.test.ts.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}
