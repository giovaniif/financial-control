import js from '@eslint/js';
import prettier from 'eslint-config-prettier';

import { ignores } from './src/base.js';

export default [ignores, js.configs.recommended, prettier];
