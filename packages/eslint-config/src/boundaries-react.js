import boundaries from 'eslint-plugin-boundaries';
import tseslint from 'typescript-eslint';

/**
 * Feature-Sliced Design layering for `apps/web`, from .claude/architecture.md.
 *
 * `shared` is deliberately not sliced: its segments (ui, api, lib, config) are
 * meant to compose with each other. Every layer above it is sliced, and a slice
 * may only import its own files plus the layers strictly below.
 */
const elements = [
  { type: 'app', pattern: 'src/app/**/*' },
  { type: 'pages', pattern: 'src/pages/*', mode: 'folder', capture: ['slice'] },
  {
    type: 'widgets',
    pattern: 'src/widgets/*',
    mode: 'folder',
    capture: ['slice'],
  },
  {
    type: 'features',
    pattern: 'src/features/*',
    mode: 'folder',
    capture: ['slice'],
  },
  {
    type: 'entities',
    pattern: 'src/entities/*',
    mode: 'folder',
    capture: ['slice'],
  },
  { type: 'shared', pattern: 'src/shared/**/*' },
];

const sameSlice = (type) => [type, { slice: '${from.slice}' }];

export const boundariesReactConfig = tseslint.config({
  files: ['src/**/*.{ts,tsx}'],
  plugins: { boundaries },
  settings: {
    'boundaries/include': ['src/**/*'],
    'boundaries/elements': elements,
  },
  rules: {
    'boundaries/element-types': [
      'error',
      {
        default: 'disallow',
        message:
          "'${file.type}' cannot import '${dependency.type}' — layers import downward only, and a slice never imports its siblings",
        rules: [
          {
            from: 'app',
            allow: [
              'app',
              'pages',
              'widgets',
              'features',
              'entities',
              'shared',
            ],
          },
          {
            from: 'pages',
            allow: [
              sameSlice('pages'),
              'widgets',
              'features',
              'entities',
              'shared',
            ],
          },
          {
            from: 'widgets',
            allow: [sameSlice('widgets'), 'features', 'entities', 'shared'],
          },
          {
            from: 'features',
            allow: [sameSlice('features'), 'entities', 'shared'],
          },
          { from: 'entities', allow: [sameSlice('entities'), 'shared'] },
          { from: 'shared', allow: ['shared'] },
        ],
      },
    ],
    'boundaries/entry-point': [
      'error',
      {
        default: 'disallow',
        message:
          "'${dependency.type}/${dependency.slice}' must be imported through its public index.ts",
        rules: [
          {
            target: ['pages', 'widgets', 'features', 'entities'],
            allow: 'index.ts',
          },
          { target: ['app', 'shared'], allow: '**/*' },
        ],
      },
    ],
  },
});
