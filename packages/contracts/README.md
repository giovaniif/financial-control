# @fin/contracts

The shared request and response types for the HTTP API — **the only thing both
`@fin/api` and `@fin/web` import.**

## What belongs here

Request and response shapes, and the primitive aliases they are built from.
That is all.

## What does not

- **No domain logic.** No `Money` arithmetic, no cycle resolution, no
  validation. Those live in `apps/api/src/domain`, which this package must
  never depend on.
- **No Prisma types.** Persistence shapes are an implementation detail of the
  backend and never cross the wire.
- **No React**, and no runtime dependencies at all. The build emits type
  declarations and nothing else.

If something needs to be shared beyond DTOs, that is a signal the boundary is
wrong — see `.claude/architecture.md`.

## Conventions

- **Money is integer cents** (`Cents`), matching the backend's `Money` value
  object. Never a decimal number of reais.
- Field names match the domain vocabulary in `docs/USE_CASES.md` §3 exactly:
  `surplus`, `expectedSurplus`, `netSurplus`. No synonyms.
