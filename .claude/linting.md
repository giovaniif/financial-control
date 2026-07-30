# Linting and formatting

**Rule: every package lints clean before a PR goes up.** Zero errors, zero warnings. A
warning you intend to ignore is a warning that will be ignored forever.

## Commands

```bash
pnpm turbo run lint          # eslint across the workspace
pnpm turbo run typecheck     # tsc --noEmit — type errors are lint errors
pnpm turbo run format:check  # prettier --check
pnpm format                  # prettier --write, the only way to format
```

## Prettier

One config at the repo root, `.prettierrc`, applying to every package:

```json
{
  "printWidth": 80,
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "arrowParens": "always"
}
```

80 columns is deliberate: stacked PRs get reviewed in split-diff view, and lines that wrap
in the review pane are lines that do not get read.

**Never hand-format.** Prettier owns whitespace; ESLint owns correctness. There is no
overlap and no argument — `eslint-config-prettier` disables every stylistic rule that
would conflict.

## ESLint

Flat config. Shared bases live in `packages/eslint-config` and are composed per app.

Common to everything:

- `@eslint/js` recommended
- `typescript-eslint` **strict-type-checked** + **stylistic-type-checked**
- `eslint-plugin-import` — resolution and cycle detection
- `eslint-plugin-vitest` on test files
- `eslint-config-prettier` last, always

Frontend adds `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, and
`eslint-plugin-jsx-a11y`.

### Rules that are errors, not warnings

| Rule | Why |
|---|---|
| `@typescript-eslint/no-explicit-any` | `any` erases the type safety the whole stack is built on. Narrow `unknown` with a guard |
| `@typescript-eslint/no-floating-promises` | An unawaited promise in an interactor silently drops a write |
| `@typescript-eslint/no-misused-promises` | Async handlers passed where a sync callback is expected |
| `@typescript-eslint/strict-boolean-expressions` | `if (amount)` is a bug when `amount` can be `0` — and here it frequently is |
| `@typescript-eslint/no-unnecessary-condition` | Catches checks that TypeScript already proves impossible |
| `import/no-cycle` | Circular imports between slices are the first sign the boundary is wrong |
| `react-hooks/exhaustive-deps` | A real bug detector. Fix the dependency array or restructure — never silence it |

### Disabling a rule

No blanket `/* eslint-disable */` at the top of a file. A single-line disable needs a
comment naming the reason, and that is one of the few comments worth writing:

```ts
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
// Prisma's JSON column is typed as `any` upstream; validated by the mapper below.
const payload = row.metadata;
```

## Architecture boundaries are lint rules

`eslint-plugin-boundaries` encodes the layering from `.claude/architecture.md`. **An
architecture violation fails CI**; it is not something to catch in review.

### Backend — `apps/api`

Elements: `domain`, `application`, `infrastructure`, `interface`.

```
domain          → (nothing)
application     → domain
infrastructure  → domain, application
interface       → domain, application
```

Plus a hard rule: **`@prisma/client` may only be imported under
`src/infrastructure/prisma/`.** Everything else goes through a repository port.

```ts
// src/domain/budgeting/cycle.ts
import { PrismaClient } from '@prisma/client';
//       ^ error  boundaries/element-types: 'domain' cannot import 'infrastructure'
```

### Frontend — `apps/web`

Elements, in order: `app`, `pages`, `widgets`, `features`, `entities`, `shared`.
Each may import only from layers strictly below it.

```ts
// src/entities/cycle/model/store.ts
import { CycleLedger } from '@/features/ledger';
//       ^ error  boundaries/element-types: 'entities' cannot import 'features'
```

And `boundaries/no-private` forbids reaching into another slice's internals — imports go
through the slice's public `index.ts`:

```ts
// src/features/settle-entry/ui/Row.tsx
import { cardStore } from '@/features/register-purchase/model/store';
//       ^ error  boundaries/no-private: import via the slice's public API
```

Same-layer cross-slice imports are forbidden outright. If two slices need to share, the
shared part belongs one layer down.

## CI

Path-filtered per app, so a backend-only PR does not run the frontend suite. Every job
must be green before merge.

| Workflow | Jobs |
|---|---|
| `.github/workflows/ci.yml` | `lint` (eslint + prettier --check + boundaries), `typecheck`, `test` (vitest with coverage thresholds), `build` |

CI runs the same commands you run locally. There is no CI-only check and no local-only
check — if it passes here it passes there.

## Pre-PR checklist

```bash
pnpm turbo run lint typecheck build
pnpm turbo run test -- --coverage
pnpm turbo run format:check
```

All green, or the PR does not go up.
