# Financial Control — working agreement

Personal finance application replacing a spreadsheet: payday-cycle budgeting, credit-card
invoices, and savings-bucket projections. pnpm monorepo — Node.js API (`apps/api`,
classical DDD) and React + Vite frontend (`apps/web`, Feature-Sliced Design), PostgreSQL
via Prisma.

What the product does: @docs/USE_CASES.md · How it is modelled: @docs/DOMAIN_MODEL.md

This file is about *how we work here*.

## The eight rules

1. **No work without a Linear issue.** Team **Financial Control** (`FIN-`). Every task —
   including a bug found mid-flight — is an estimated issue before code is written.
   → @.claude/workflow.md
2. **All GitHub workflow goes through `gh stack`.** Never `git push` a stack branch,
   never open a PR by hand, never hand-rebase. Related changes ship as a **stack of
   small PRs**, one reviewable layer each. → @.claude/workflow.md
3. **TDD: the test comes first.** Red, green, refactor. A change that alters behaviour
   without a test written *before* it is not done. → @.claude/testing.md
4. **Coverage never drops below 80%**, and below 95% in the backend `domain/` and
   `application/` layers. Enforced by Vitest thresholds, not by review.
   → @.claude/testing.md
5. **The architecture is enforced by the linter.** Backend layering is classical DDD;
   frontend is Feature-Sliced Design. Import-boundary violations fail the lint run.
   → @.claude/architecture.md · @.claude/linting.md
6. **Everything is written in English, except what the user reads.** Identifiers, types,
   comments, tests, commits, Linear issues, PR titles and descriptions and everything in
   `docs/` are English. **User-visible copy is pt-BR** — the one exception, and the only
   one. Currency and date *formatting* stay Brazilian throughout.
   → @.claude/code-style.md
7. **Do not write comments** unless they explain something genuinely un-inferable from the
   code. → @.claude/code-style.md
8. **Everything runs locally.** No Render, no Vercel, no Supabase, no deployment of
   any kind — one machine, one user. A stack merges atomically; when merging only part
   of one, cut at a layer that leaves `main` coherent. → @.claude/deployment.md

## Package manager

**pnpm only.** Never `npm` or `yarn` — a stray `package-lock.json` breaks the workspace.

```bash
pnpm install                      # whole workspace
pnpm --filter @fin/api <script>   # one package
pnpm dlx <tool>                   # one-off, never a global install
```

Turborepo drives the task graph: `pnpm turbo run <task>` from the root.

## Before you say a change is done

```bash
pnpm check   # lint, typecheck, build, format:check, then tests with coverage
```

There is no CI. That command is the only thing standing between a mistake and `main`,
so run it and read it. Report what actually ran, with its output. A failing test described as passing is worse
than no test at all. If you skipped a check, say which and why.
