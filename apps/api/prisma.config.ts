import { existsSync } from 'node:fs';
import path from 'node:path';

import { defineConfig } from 'prisma/config';

// A `prisma.config.ts` replaces the deprecated `package.json#prisma` key, but
// unlike it the Prisma CLI no longer loads `.env` on its own — the connection
// strings have to be put on the environment before the config is read.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: path.join('src', 'infrastructure', 'prisma', 'schema.prisma'),
});
