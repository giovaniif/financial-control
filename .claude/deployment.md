# Running it — local only

**Rule: this application never leaves this machine.** It runs on one machine,
for one person, and there is no hosted environment of any kind.

That is a decision, not a gap. A single-user finance app that never leaves the
machine it runs on needs no platform accounts, no secret store, no deploy
pipeline, and no authentication — which is why `docs/USE_CASES.md` §7 keeps
authentication out of scope.

It does run as containers rather than as a terminal you have to keep open.
The Coolify on this box supervises them: it restarts them on boot and rebuilds
them from the repo. That is a **process supervisor on the same machine**, not a
platform — nothing is uploaded anywhere, no account holds any of it, and every
reason above still holds unchanged.

| Piece | Where it runs |
|---|---|
| API (`apps/api`) | Container under Coolify. `pnpm dev` for development |
| Web (`apps/web`) | Built to static files, behind nginx in a container. `pnpm dev` for development |
| Database | PostgreSQL in Docker, from `docker-compose.yml` at the repo root — **the same container either way** |

## Deploying it

```bash
docker compose -f compose.production.yml -p fin-prod up -d --build
```

Coolify runs exactly that from `compose.production.yml`, which is why the file
is worth reading before changing anything here.

Two things about it are load-bearing:

- **The database is not in it.** `fin-postgres` holds the real data and is
  owned by `docker-compose.yml`. The API joins its network as an *external*
  one, so bringing this stack down can never take the data's network with it,
  and connects to `postgres:5432` — the container's port, not the 5434
  published to the host.
- **Only the web port is published.** The API has no port at all and is
  reachable only through the web container's `/api` proxy, which is what
  `vite.config.ts` does in development.

Secrets arrive as environment variables from Coolify. `.env.production.example`
records the names and no values; this repository is public.

Migrations run on start-up, `prisma migrate deploy`, before the server listens.
A migration that fails stops the container rather than serving requests against
a schema the code does not expect.

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
snapshots, and the app no longer exports its own data (UC-1.6 is removed), so
`pnpm db:reset` is exactly as final as it sounds. The backup is a dump:

```bash
docker exec fin-postgres pg_dump -U fin fin > backup.sql
```

Take one before a reset, before a destructive migration, and before anything
else that cannot be undone. Nothing else will.

## Reaching it from another machine

Everything binds every interface, so the app is reachable from any machine on
the same private network — substitute this machine's hostname for `localhost`.
Only the web port is ever open; `/api` is proxied to the API behind it, by
Vite in development and by nginx in the container.

| | Port |
|---|---|
| Deployed | **8090** |
| `pnpm dev` | 5173 |

**Nothing here is authenticated.** Anything that can reach either port can read
and change every number in the app, so it must stay on the tailnet — never
port-forwarded, never exposed to the public internet. If that ever changes,
authentication has to come first, not after.

That warning is *load-bearing now in a way it was not before*. The app used to
exist only while somebody held a terminal open; it now comes back on every
reboot, unattended, whether or not anyone meant it to.

**There is deliberately no domain.** Coolify will happily put one in front of
this, and doing so is the single change that turns "unauthenticated on the
tailnet" into "unauthenticated on the internet". The port is the whole
protection. A domain is not a configuration step here — it is the work on
`FIN-116`, done first.

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
