# Running it — local only

**Rule: this application is not deployed.** It runs on one machine, for one
person, and there is no hosted environment of any kind.

That is a decision, not a gap. A single-user finance app that never leaves the
machine it runs on needs no platform accounts, no secret store, no deploy
pipeline, and no authentication — which is why `docs/USE_CASES.md` §7 keeps
authentication out of scope.

| Piece | Where it runs |
|---|---|
| API (`apps/api`) | Node, started by `pnpm dev` or `pnpm --filter @fin/api start` |
| Web (`apps/web`) | Vite, started by `pnpm dev` |
| Database | PostgreSQL in Docker, from `docker-compose.yml` at the repo root |

## The database

```bash
pnpm db:up      # start PostgreSQL
pnpm db:down    # stop it, keeping the data
pnpm db:reset   # delete the volume and start clean
```

Port **5434**, not 5432: this machine already runs other projects' databases on
5432 and 5433. The credentials in `docker-compose.yml` are committed on purpose
— they guard a container on `localhost` holding data that only exists on this
machine, and pretending otherwise would just make the setup harder to run.

`DATABASE_URL` is the only connection string. There is no pooler in front of the
database, so migrations and the application share it and Prisma needs no
separate `directUrl`.

## Migrations

```bash
pnpm --filter @fin/api db:migrate   # create and apply, in development
pnpm --filter @fin/api db:deploy    # apply committed migrations only
```

Migrations are committed, never edited after merge, and are their own PR at the
bottom of a stack. Rolling one back is forward-only: a bad migration is fixed by
a new migration.

**Back up before anything destructive.** There is no managed database taking
snapshots, so `pnpm db:reset` is exactly as final as it sounds. The app's own
export (UC-1.6) is the backup.

## Reaching it from another machine

The API and Vite both bind every interface, so the app is reachable from any
machine on the same private network — substitute this machine's hostname for
`localhost`. Vite proxies `/api` to the API on the same host, so only the web
port needs to be open.

**Nothing here is authenticated.** Anything that can reach port 5173 can read
and change every number in the app, so it must stay on the tailnet — never
port-forwarded, never exposed to the public internet. If that ever changes,
authentication has to come first, not after.

That ordering matters more now that the app has an assistant. Rate-limiting
the model-backed routes is worth doing and is not what makes the app safe to
expose: anything that can reach it can already read and rewrite every figure
without going near the assistant. The AI-specific work that authentication
would require — rekeying rate limits, scoping every read tool, per-user spend
— is tracked on `FIN-116`, and `docs/DOMAIN_MODEL.md` §6 records the one rule
that has to hold from the first tool so that day stays a contained change.

## Checks

There is no CI either. Lint, typecheck, tests with coverage, build and the
formatting check all run here, in one command:

```bash
pnpm check
```

That is the same command in every situation — there is no hosted runner that
might behave differently, and nothing that runs only on a pull request. The
trade is that nothing *forces* it: `pnpm check` has to pass before a PR goes up,
and the only thing enforcing that is you.
