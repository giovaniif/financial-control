import boundaries from 'eslint-plugin-boundaries';
import tseslint from 'typescript-eslint';

/**
 * Classical DDD layering for `apps/api`, from .claude/architecture.md.
 *
 * `prisma-adapter` is listed before `infrastructure` because
 * eslint-plugin-boundaries resolves an element to the first pattern that
 * matches, and `src/infrastructure/prisma/**` sits inside
 * `src/infrastructure/**`. It is the only element allowed to import
 * `@prisma/client`.
 */
const elements = [
  {
    type: 'prisma-adapter',
    mode: 'file',
    pattern: 'src/infrastructure/prisma/**/*',
  },
  { type: 'infrastructure', mode: 'file', pattern: 'src/infrastructure/**/*' },
  { type: 'domain', mode: 'file', pattern: 'src/domain/**/*' },
  { type: 'application', mode: 'file', pattern: 'src/application/**/*' },
  { type: 'interface', mode: 'file', pattern: 'src/interface/**/*' },
  { type: 'composition-root', mode: 'file', pattern: 'src/*.ts' },
];

export const boundariesNodeConfig = tseslint.config({
  files: ['src/**/*.ts'],
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
        message: "'${file.type}' cannot import '${dependency.type}'",
        rules: [
          { from: 'domain', allow: ['domain'] },
          { from: 'application', allow: ['domain', 'application'] },
          {
            from: 'infrastructure',
            allow: [
              'domain',
              'application',
              'infrastructure',
              'prisma-adapter',
            ],
          },
          {
            from: 'prisma-adapter',
            allow: [
              'domain',
              'application',
              'infrastructure',
              'prisma-adapter',
            ],
          },
          { from: 'interface', allow: ['domain', 'application', 'interface'] },
          {
            // The composition root is the one place allowed to see every
            // layer: it is where the ports meet their implementations.
            from: 'composition-root',
            allow: [
              'composition-root',
              'domain',
              'application',
              'infrastructure',
              'prisma-adapter',
              'interface',
            ],
          },
        ],
      },
    ],
    'boundaries/external': [
      'error',
      {
        default: 'allow',
        rules: [
          {
            from: 'domain',
            disallow: ['*'],
            message:
              "'domain' is pure — it cannot import the external package '${dependency.source}'",
          },
          {
            from: ['application', 'infrastructure', 'interface'],
            disallow: ['@prisma/client'],
            message:
              "'@prisma/client' may only be imported under src/infrastructure/prisma/",
          },
        ],
      },
    ],
  },
});

/**
 * A test may import a test framework, even a domain test. The purity rule is
 * about what the production code depends on, not what proves it works — the
 * layering rules still apply, so a domain test reaching for infrastructure is
 * still an error.
 */
export const testsMayImportTheirFramework = tseslint.config({
  files: ['src/**/*.test.ts'],
  rules: { 'boundaries/external': 'off' },
});

export const noNodeBuiltinsInDomain = tseslint.config({
  files: ['src/domain/**/*.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['node:*'],
            message:
              "'domain' is pure — take a port from domain/ports instead of a node builtin.",
          },
        ],
      },
    ],
  },
});
