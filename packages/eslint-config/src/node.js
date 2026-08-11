import globals from 'globals';
import tseslint from 'typescript-eslint';

import { baseConfig } from './base.js';
import {
  boundariesNodeConfig,
  noNodeBuiltinsInDomain,
  testsMayImportTheirFramework,
} from './boundaries-node.js';

/** @param {{ tsconfigRootDir: string }} options */
export function nodeConfig({ tsconfigRootDir }) {
  return tseslint.config(
    baseConfig({ tsconfigRootDir }),
    { languageOptions: { globals: globals.node } },
    boundariesNodeConfig,
    noNodeBuiltinsInDomain,
    testsMayImportTheirFramework,
  );
}
