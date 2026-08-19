import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, '..', 'fixtures');

/**
 * Every rule .claude/architecture.md declares, paired with the fixture that
 * breaks it. If one of these stops firing the architecture is no longer
 * enforced, which is the failure this script exists to catch.
 */
const expected = {
  api: [
    [
      'src/domain/budgeting/imports-infrastructure.ts',
      'boundaries/element-types',
    ],
    ['src/domain/budgeting/imports-external.ts', 'boundaries/external'],
    ['src/domain/budgeting/imports-node-builtin.ts', 'no-restricted-imports'],
    [
      'src/application/budgeting/imports-infrastructure.ts',
      'boundaries/element-types',
    ],
    [
      'src/interface/http/imports-infrastructure.ts',
      'boundaries/element-types',
    ],
    ['src/interface/http/imports-prisma.ts', 'boundaries/external'],
    ['src/application/budgeting/imports-anthropic.ts', 'boundaries/external'],
  ],
  web: [
    ['src/entities/cycle/imports-features.ts', 'boundaries/element-types'],
    [
      'src/features/settle-entry/imports-sibling-slice.ts',
      'boundaries/element-types',
    ],
    ['src/features/settle-entry/imports-private.ts', 'boundaries/entry-point'],
  ],
};

function lint(fixture) {
  const cwd = path.join(fixtures, fixture);
  try {
    execFileSync('eslint', ['src', '-f', 'json'], { cwd, encoding: 'utf8' });
    return [];
  } catch (error) {
    if (typeof error.stdout !== 'string' || error.stdout === '') throw error;
    return JSON.parse(error.stdout);
  }
}

const failures = [];

for (const [fixture, cases] of Object.entries(expected)) {
  const results = lint(fixture);
  const cwd = path.join(fixtures, fixture);
  const errorsByFile = new Map(
    results.map((r) => [path.relative(cwd, r.filePath), r.messages]),
  );

  for (const [file, ruleId] of cases) {
    const fired = (errorsByFile.get(file) ?? []).some(
      (m) => m.ruleId === ruleId && m.severity === 2,
    );
    console.log(
      `${fired ? '  ok  ' : ' FAIL '} ${fixture}/${file} → ${ruleId}`,
    );
    if (!fired) failures.push(`${fixture}/${file} did not report ${ruleId}`);
  }

  const violationFiles = new Set(cases.map(([file]) => file));
  for (const [file, messages] of errorsByFile) {
    if (violationFiles.has(file)) continue;
    const boundaryErrors = messages.filter(
      (m) => m.severity === 2 && m.ruleId?.startsWith('boundaries/'),
    );
    if (boundaryErrors.length > 0) {
      failures.push(
        `${fixture}/${file} is a legal import but reported ${boundaryErrors
          .map((m) => m.ruleId)
          .join(', ')}`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error('\nBoundary enforcement is broken:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('\nAll architecture boundaries are enforced.');
