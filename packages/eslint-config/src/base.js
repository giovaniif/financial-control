import js from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import tseslint from 'typescript-eslint';

export const ignores = {
  ignores: [
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
    '**/node_modules/**',
    '**/.turbo/**',
    '**/.vercel/**',
  ],
};

/**
 * The shared flat config every package composes.
 *
 * @param {{ tsconfigRootDir: string }} options
 *   `tsconfigRootDir` must be the consuming package's directory so that
 *   `projectService` resolves that package's tsconfig, not the repo root's.
 */
export function baseConfig({ tsconfigRootDir }) {
  return tseslint.config(
    ignores,
    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    importPlugin.flatConfigs.recommended,
    importPlugin.flatConfigs.typescript,
    {
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      settings: {
        'import/resolver': {
          typescript: { alwaysTryTypes: true, project: tsconfigRootDir },
        },
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/no-misused-promises': 'error',
        // `allowNumber` and `allowString` default to true, which lets the
        // `if (amount)` bug through — and in this domain `amount` is a number
        // that is legitimately 0. See .claude/linting.md.
        '@typescript-eslint/strict-boolean-expressions': [
          'error',
          {
            allowNumber: false,
            allowString: false,
            allowNullableObject: false,
          },
        ],
        '@typescript-eslint/no-unnecessary-condition': 'error',
        '@typescript-eslint/consistent-type-imports': 'error',
        'import/no-cycle': 'error',
      },
    },
    {
      files: ['src/**/*.{ts,tsx}'],
      rules: { 'import/no-default-export': 'error' },
    },
    {
      files: ['**/*.test.{ts,tsx}'],
      plugins: { vitest },
      rules: vitest.configs.recommended.rules,
      settings: { vitest: { typecheck: true } },
    },
    {
      // Config files and ops scripts sit outside every package's tsconfig
      // `include`, so the project service cannot type them. They still get the
      // syntactic rules, and they are the one place a default export is
      // required.
      files: ['*.{js,mjs,cjs,ts}', 'scripts/**/*.{js,mjs,cjs}'],
      extends: [tseslint.configs.disableTypeChecked],
      languageOptions: { parserOptions: { projectService: false } },
      rules: { 'import/no-default-export': 'off' },
    },
    prettier,
  );
}
