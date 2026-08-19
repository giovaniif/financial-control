# Financial Control

A personal finance application replacing a spreadsheet: payday-cycle budgeting,
credit-card invoices, and savings-bucket projections.

Everything runs on one machine. There is no hosted environment, no deployment
pipeline and no cloud database — see [`.claude/deployment.md`](.claude/deployment.md).

- What it does: [`docs/USE_CASES.md`](docs/USE_CASES.md)
- How it is modelled: [`docs/DOMAIN_MODEL.md`](docs/DOMAIN_MODEL.md)
- How the work is organised: [`CLAUDE.md`](CLAUDE.md)

## Running it

Requires Node (the version in `.nvmrc`), pnpm and Docker.

```bash
pnpm install
cp .env.example apps/api/.env      # then fill in DATABASE_URL
pnpm db:up                         # PostgreSQL on port 5434
pnpm --filter @fin/api db:migrate  # apply migrations
pnpm dev                           # API and web together
```

| Piece | Address |
| --- | --- |
| Web | `http://localhost:5173/` |
| API | `http://localhost:3333/` |

Both bind every interface, so from another machine on the same private network
substitute this machine's hostname for `localhost`. The web app proxies `/api`
to the API, so only the web port has to be reachable.

## The assistant, and running it for free

The first-run conversation and the assistant reach the model through one port,
so which model answers is a wiring decision. By default it is the Claude API,
and with no `ANTHROPIC_API_KEY` the app still runs — the conversation reports
itself as switched off and every other figure stays readable.

Set **`OLLAMA_MODEL`** to run the whole flow against a local model instead:
free, unlimited, and it takes precedence over any key that is configured.

```bash
ollama serve                       # must be running; http://127.0.0.1:11434
ollama pull qwen2.5:7b             # a capable tool-caller at this size
OLLAMA_MODEL=qwen2.5:7b pnpm dev
```

Leave it unset and nothing changes, which is the point: the default path is
never the test path. It exercises *our* behaviour — streaming, tool-call round
trips, the confirmation step, the error paths — and nothing about whether the
prompts are good. A 7B model's tool-calling is not Haiku's, in either
direction, so prompt quality is still checked against the real model.

## Everyday commands

```bash
pnpm dev                          # both apps, watching
pnpm check                        # lint, typecheck, build, format, tests + coverage
pnpm test                         # just the tests
pnpm format                       # write, rather than check

pnpm db:up / pnpm db:down         # start and stop PostgreSQL
pnpm db:reset                     # throw the data away and start clean
```

The container also creates **`fin_test`**, a separate database for the DB-backed
tests: they truncate every table, and pointing them at `fin` would destroy real
data on every `pnpm check`. `TEST_DATABASE_URL` selects it, and the test setup
refuses to run against any database not named `fin_test`.

