import { defineConfig } from 'vitest/config';

import {
  coverage,
  globalThresholds,
  pureLayerThresholds,
} from '../../vitest.shared.js';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      ...coverage({ ...globalThresholds, ...pureLayerThresholds }),
      // The process entrypoint: it binds a port and is exercised by running
      // the server, not by a unit test. Everything it wires is covered.
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/main.ts'],
    },
  },
});
