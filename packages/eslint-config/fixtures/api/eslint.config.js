import { nodeConfig } from '../../src/node.js';

export default [
  ...nodeConfig({ tsconfigRootDir: import.meta.dirname }),
  {
    // These fixtures import packages that are deliberately not installed. What
    // is under test is which boundary rule fires, not whether the module
    // resolves, so the resolution rules are silenced here only.
    rules: {
      'import/no-unresolved': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
];
