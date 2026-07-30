import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

import { ignores } from './src/base.js';

export default [
  ignores,
  { languageOptions: { globals: globals.node } },
  // The fixtures are deliberately broken TypeScript. They are linted by
  // scripts/verify-boundaries.js, with their own configs, and asserted to fail.
  { ignores: ['fixtures/**'] },
  js.configs.recommended,
  prettier,
];
