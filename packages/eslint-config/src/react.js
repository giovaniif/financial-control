import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import { baseConfig } from './base.js';
import { boundariesReactConfig } from './boundaries-react.js';

/** @param {{ tsconfigRootDir: string }} options */
export function reactConfig({ tsconfigRootDir }) {
  return tseslint.config(
    baseConfig({ tsconfigRootDir }),
    jsxA11y.flatConfigs.recommended,
    reactHooks.configs.flat['recommended-latest'],
    boundariesReactConfig,
    {
      languageOptions: { globals: globals.browser },
      plugins: { 'react-refresh': reactRefresh },
      rules: {
        'react-refresh/only-export-components': [
          'error',
          { allowConstantExport: true },
        ],
      },
    },
  );
}
