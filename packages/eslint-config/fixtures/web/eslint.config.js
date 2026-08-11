import { reactConfig } from '../../src/react.js';

export default [
  ...reactConfig({ tsconfigRootDir: import.meta.dirname }),
  {
    // See the note in fixtures/api/eslint.config.js — what is under test is
    // which boundary rule fires, not module resolution.
    rules: {
      'import/no-unresolved': 'off',
    },
  },
];
