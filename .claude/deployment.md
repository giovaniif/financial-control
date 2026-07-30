# Deployment — Render, Vercel, Supabase

**Rule: deployment is GitHub Actions only.** Never deploy from a laptop — a manual deploy
is a state nobody can reproduce.

| Piece | Platform |
|---|---|
| API (`apps/api`) | **Render** — web service, deployed via deploy hook |
| Web (`apps/web`) | **Vercel** — built and deployed via the Vercel CLI in CI |
| Database | **Supabase** — managed PostgreSQL, reached by Prisma |

## Environments

| Trigger | Environment |
|---|---|
| Merge to `main` | **dev / staging** — Render `fin-api-dev`, Vercel dev alias, Supabase dev project |
| Tag `v*` | **production** — Render `fin-api`, Vercel production, Supabase prod project |

**`main` is a live environment.** Merging a stack halfway leaves the API expecting a UI
that has not shipped. Order stack merges so that **every intermediate state of `main` is
coherent** — backend first, additive, then the frontend that consumes it. If that is not
possible, put the change behind a flag.

## Workflows

```
.github/workflows/
  ci.yml        # lint, typecheck, test+coverage, build — on PR and on main
  deploy.yml    # main → dev, v* tag → production
```

`ci.yml` is path-filtered per app so a backend-only PR does not run the frontend suite.
Each stacked PR is checked independently — that is what makes small stacked PRs safe.

Setup notes that matter in CI:

- `pnpm/action-setup` **before** `actions/setup-node`, and `cache: pnpm` on the latter.
- Turborepo remote caching keyed on the lockfile; a warm cache is what keeps a 6-PR stack
  from taking an hour.
- Node version is pinned in `package.json` `engines` and matched in CI. Not "latest".

## Render — API

Configured by `render.yaml` at the repo root, committed.

- Build runs from the repo root — it is a monorepo, and Render must install the workspace,
  not just `apps/api`.
- Deploy is triggered by `curl -fsS -X POST "$RENDER_DEPLOY_HOOK_DEV"` from `deploy.yml`,
  not by Render's own GitHub integration. Auto-deploy stays **off** in the Render
  dashboard, or every merge deploys twice.
- Health check endpoint must exist and be wired in `render.yaml`.

## Vercel — Web

- The Vercel project's **Root Directory is `apps/web`**. Consequently the CLI steps in
  `deploy.yml` run **from the repo root** — `cd`-ing into `apps/web` first makes the CLI
  descend into `apps/web/apps/web` and fail with `spawn sh ENOENT`.
- Flow: `vercel pull` → `vercel build` → `vercel deploy --prebuilt`.
- `vercel deploy` mints a fresh preview URL every run, so the dev job must
  `vercel alias set` the new deployment onto the stable dev alias afterwards. Without it
  the alias silently keeps serving the first build forever.
- `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` are job-level `env`; `VERCEL_TOKEN` is passed per
  step.

## Supabase — database

- Prisma connects through the **pooled** connection string (`DATABASE_URL`, pgBouncer,
  port 6543) for the app, and the **direct** connection (`DIRECT_URL`, port 5432) for
  migrations. Both go in the Prisma datasource — migrations fail against the pooler.
- **Migrations run in the deploy pipeline** (`prisma migrate deploy`), before the API
  starts, never by hand against production.
- Dev and production are **separate Supabase projects**, not separate schemas in one.
- Never point a local dev environment at the production database.

## Secrets

GitHub Environments `dev` and `production`, each with its own values:

| Secret | Used for |
|---|---|
| `RENDER_DEPLOY_HOOK_DEV` / `_PROD` | Triggering the Render deploy |
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | Vercel CLI |
| `DATABASE_URL`, `DIRECT_URL` | Prisma, pooled and direct |

Secrets live in GitHub Environments and the platform dashboards — never in the repo, never
in `turbo.json`, never in a workflow file as a literal. `.env.example` is committed with
empty values and documents every variable the app reads.

## Rollback

- **Web**: promote the previous deployment in Vercel — instant, no rebuild.
- **API**: redeploy the previous commit from the Render dashboard.
- **Database**: forward-only. A bad migration is fixed by a new migration, never by
  editing a merged one. This is why migrations are their own PR at the bottom of a stack:
  they are the one thing that cannot be cleanly reverted.
