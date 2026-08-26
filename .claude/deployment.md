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
| Database | PostgreSQL in a container in the same stack — **one database, whichever way the app is running** |

## Deploying it

```bash
docker compose -f compose.production.yml -p fin-prod up -d --build
```

Coolify runs exactly that from `compose.production.yml`, which is why the file
is worth reading before changing anything here.

Two things about it are load-bearing:

- **The database is in it, and there is only one.** It publishes 5434 to the
  host, so `pnpm dev` reaches the same data through the connection string it
  already has, while the API reaches it over the compose network at
  `postgres:5432`. One machine, one user, one dataset — a second database for
  development would diverge from the first entry settled against whichever
  happened to be up. The data is a **named volume**, so `down` cannot take it
  and only an explicit `down -v` ever will.
- **Only the web port is published.** The API has no port at all and is
  reachable only through the web container's `/api` proxy, which is what
  `vite.config.ts` does in development.

Secrets arrive as environment variables from Coolify. `.env.production.example`
records the names and no values; this repository is public.

Migrations run on start-up, `prisma migrate deploy`, before the server listens.
A migration that fails stops the container rather than serving requests against
a schema the code does not expect.

## The database

**A Coolify managed Postgres, not a service in the compose file.** That is the
whole reason it sits outside a stack it would otherwise belong in: Coolify's
scheduled backups only cover a standalone database resource, and an unbacked-up
database is the one risk this project could not argue away — UC-1.6 removed the
app's own export because *"a database dump does better"*, which is only true if
something actually takes one.

It is started, stopped and backed up from Coolify, so there are no `pnpm db:*`
scripts any more. It restarts on boot like everything else.

Port **5434**, not 5432: this machine already runs other projects' databases on
5432 and 5433. `pnpm dev` reaches it there, unchanged. The credentials are
`fin`/`fin` on purpose — they guard a container on a tailnet-only machine whose
app is itself unauthenticated, so a strong password there would protect nothing
that is not already open, and would only make the setup harder to run.

The API reaches it by the resource's **internal hostname on the `coolify`
network**, which is its generated uuid. That is why `DATABASE_URL` has no
default in `compose.production.yml`: there is nothing sensible to fall back to,
and a wrong default that quietly connects somewhere is worse than a missing one.

`DATABASE_URL` is the only connection string. There is no pooler in front of the
database, so migrations and the application share it and Prisma needs no
separate `directUrl`.

`fin_test` lives beside `fin` and the tests truncate every table in it. It was
created by hand when the database was split out — a managed resource has no
init-script hook, so a rebuilt one needs `create database fin_test owner fin`
before `pnpm check` will pass.

## Migrations

```bash
pnpm --filter @fin/api db:migrate   # create and apply, in development
pnpm --filter @fin/api db:deploy    # apply committed migrations only
```

Migrations are committed, never edited after merge, and are their own PR at the
bottom of a stack. Rolling one back is forward-only: a bad migration is fixed by
a new migration.

**Coolify takes a scheduled backup, and it is the only thing that does.** It
runs against the managed resource and is configured on it — the app still has
no export of its own (UC-1.6 is removed), so that schedule and the manual dump
below are the entire recovery story.

Take a dump by hand as well before anything destructive — a destructive
migration, a restore, anything that cannot be undone. The schedule protects you
from yesterday; it does not protect you from the next five minutes:

```bash
docker exec $(docker ps -qf name=<database-uuid>) pg_dump -U fin fin > backup.sql
```

The uuid is the resource's, visible in Coolify or in its URL.

## Reaching it from another machine

Everything binds every interface, so the app is reachable from any machine on
the same private network — substitute this machine's hostname for `localhost`.
Only the web port is ever open; `/api` is proxied to the API behind it, by
Vite in development and by nginx in the container.

| | Port |
|---|---|
| Deployed | **7333** |
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
