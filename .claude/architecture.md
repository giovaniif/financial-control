# Architecture

Backend is **classical DDD**. Frontend is **Feature-Sliced Design**. Both layerings are
enforced by `eslint-plugin-boundaries` — a violation fails `pnpm check`, it is not a
review comment.

The domain content itself — aggregates, value objects, the calculation chain — lives in
@docs/DOMAIN_MODEL.md. This file is about structure and dependency rules.

## Monorepo layout

```
financial-control/
  apps/
    api/                 # Node.js backend — classical DDD
    web/                 # React + Vite frontend — Feature-Sliced Design
  packages/
    contracts/           # shared API request/response types, the only api↔web coupling
    eslint-config/       # shared flat configs: base, node, react, boundaries
    tsconfig/            # shared tsconfig bases
  docs/                  # USE_CASES.md, DOMAIN_MODEL.md
  .claude/               # these rules
  pnpm-workspace.yaml
  turbo.json
```

Package names are scoped `@fin/*`: `@fin/api`, `@fin/web`, `@fin/contracts`.

**`packages/contracts` is the only thing both apps import.** It holds request/response
shapes and nothing else — no domain logic, no Prisma types, no React. If something needs
to be shared beyond DTOs, that is a signal the boundary is wrong.

## Backend — `apps/api`

```
src/
  domain/                # pure. no I/O, no framework, no Prisma, no Date.now()
    budgeting/           cycle.ts, ledger-entry.ts, recurring-template.ts, cycle-ref.ts
    cards/               card.ts, invoice.ts, installment-plan.ts
    goals/               bucket.ts, bucket-event.ts, allocation-rule.ts
    shared/              money.ts, percentage.ts, planned-actual.ts, date-range.ts
    ports/               clock.ts, holiday-calendar.ts, repositories.ts

  application/           # one interactor per use case, named for its id
    budgeting/           uc-3-5-settle-entry.ts, uc-3-8-close-cycle.ts, ...
    cards/               uc-5-1-register-purchase.ts, ...
    goals/               uc-6-7-correct-balance.ts, ...
    projection/          uc-4-build-dashboard.ts, uc-7-project-wealth.ts, ...

  infrastructure/
    prisma/              schema.prisma, migrations/, repositories/, mappers/
    clock/  holidays/

  interface/
    http/                controllers/, routes/, dto/
```

### Dependency rule

Dependencies point **inward only**:

```
interface  →  application  →  domain
infrastructure  →  application  →  domain
```

| Layer | May import | Must never import |
|---|---|---|
| `domain` | `domain` only | anything — no Prisma, no Express, no SDK, no `node:` builtins |
| `application` | `domain` | `infrastructure`, `interface` |
| `infrastructure` | `domain`, `application` | `interface` |
| `interface` | `domain`, `application` | `infrastructure` (it receives implementations by injection) |

The domain being importless is the point: it is the money math, the cycle boundaries and
the allocation chain, and it must be testable with no database and no clock.

### Conventions

- **Aggregates enforce their own invariants** in their constructors and methods. An
  aggregate that can be constructed in an invalid state is a bug, not a validation
  concern for the layer above.
- **Value objects are immutable** and validate on construction. `Money.fromCents(-1)` for
  a limit throws; it does not return `null`.
- **`Money` is integer cents.** Never a float, never `number` arithmetic on reais. This is
  not negotiable — it is the specific failure the spreadsheet has.
- **Never call `new Date()` or `Date.now()` in the domain or application layers.** Take
  the `Clock` port. Untestable time is the most common cause of flaky tests.
- **Ports are declared in `domain/ports`**, implemented in `infrastructure`. Prisma, the
  clock and the holiday calendar all arrive this way.
- **Interactors are single-purpose classes** with one `execute` method, constructor-injected
  dependencies, named after their use-case id. Every `UC-x.y` in `docs/USE_CASES.md` maps
  to exactly one file; an orphan in either direction is a visible bug.
- **Repositories take and return domain objects**, never Prisma models. Mapping lives in
  `infrastructure/prisma/mappers/`.
- **Controllers stay thin**: validate input → call the interactor → map to a DTO. No
  business rules, no Prisma.

### Prisma

- Schema and migrations live in `apps/api/src/infrastructure/prisma/`.
- **`PrismaClient` is imported in exactly one layer.** `eslint-plugin-boundaries` enforces
  it; if you need data elsewhere, you need a repository method.
- Migrations are committed, never edited after merge, and are their own PR at the bottom
  of the stack.
- Money columns are `BigInt` cents or `Decimal(19,4)` — never `Float`.
- Every migration must be reversible or explicitly documented as not.

## Frontend — `apps/web`

Feature-Sliced Design. Layers, top to bottom:

```
src/
  app/        # providers, router, global styles — composition root
  pages/      # route-level compositions
  widgets/    # self-contained composite blocks (ChainStrip, UpcomingList, AlertList)
  features/   # user actions with behaviour (settle-entry, register-purchase)
  entities/   # domain nouns and their UI (cycle, ledger-entry, card, bucket)
  shared/     # ui kit, api client, lib, config — no domain knowledge
```

### Layer rule

**A layer may only import from layers strictly below it.** `shared` imports nothing;
`app` may import everything. No upward imports, ever — enforced by the linter.

Within a layer, code is organised into **slices** (`features/settle-entry/`,
`entities/bucket/`). Inside a slice, segments: `ui/`, `model/`, `api/`, `lib/`.

### Slice rules

- **No cross-imports between slices of the same layer.** `features/settle-entry` cannot
  import `features/register-purchase`. If they need to share, the shared part belongs one
  layer down (`entities` or `shared`).
- **Every slice has a public API** — an `index.ts` re-exporting what is meant to be used.
  Importing a slice's internals from outside is a lint error. Import
  `@/entities/cycle`, never `@/entities/cycle/model/store`.
- A slice with one consumer that will never have another is a candidate for inlining;
  FSD is a tool, not a quota.

### What goes where

| Layer | Contains | Example |
|---|---|---|
| `shared` | UI kit, `api` client, formatters, hooks with no domain meaning | `formatBRL`, `Button`, `useDebounce` |
| `entities` | A domain noun: its types, its display components, its queries | `entities/cycle`, `entities/bucket` |
| `features` | One user action, end to end, including its mutation | `features/settle-entry` |
| `widgets` | Composite blocks combining entities and features | `widgets/chain-strip` |
| `pages` | Route compositions, layout, data orchestration | `pages/ledger` |
| `app` | Providers, router, theme | `app/providers/query-provider` |

### Conventions

- Function components, named exports, one component per file, `kebab-case`
  filename. The component identifier stays `PascalCase`; the file never is.
- **Server state is TanStack Query only.** Never `useState` + `useEffect` for fetching.
  Query keys come from a single factory in `shared/api/query-keys.ts`; no inline arrays.
- Fetching lives in a slice's `api/` segment and goes through the shared `api<T>()` helper.
  Never call `fetch` from a component.
- Request/response types come from `@fin/contracts`. Do not redeclare them, do not remap
  casing at the boundary.
- **No `any`.** Narrow `unknown` with a type guard.
- Pages compose; components stay presentational and take data via props.
- **Money is formatted in exactly one place** (`shared/lib/money.ts`) and never
  hand-formatted inline. Amounts cross the wire as integer cents, matching the backend.

### Dev server

Vite must bind all interfaces — the app is developed on a headless Linux box and tested
from macOS over Tailscale:

```ts
server: { host: true, allowedHosts: ['.ts.net'] }
```

Both settings are required; they fix different layers. Hand over a URL using this
machine's hostname, never `localhost` — `localhost` on the testing machine is the
testing machine.
