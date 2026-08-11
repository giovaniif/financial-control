import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vitest/config';

import { coverage } from '../../vitest.shared.js';

// No React plugin here on purpose: Fast Refresh is meaningless in a test run,
// and Vitest's own bundler already applies the automatic JSX runtime. Including
// it only produces deprecation warnings from a different Vite major.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      ...coverage(),
      // The browser entrypoint: it mounts the tree and is exercised by loading
      // the app, not by a unit test.
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.d.ts', 'src/main.tsx'],
    },
  },
});
