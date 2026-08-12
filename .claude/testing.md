# Testing — TDD and coverage

**Rule: the test comes first, and coverage never drops below its floor.**

Vitest everywhere — backend and frontend, one runner, one config style.

## TDD is the process, not a preference

Red → green → refactor, in that order:

1. **Red.** Write a failing test that states the behaviour in plain language. Run it. See
   it fail *for the reason you expect* — a test that passes before the implementation
   exists is testing nothing.
2. **Green.** Write the least code that makes it pass.
3. **Refactor.** Clean up with the test as the safety net.

What this means in practice:

- A PR whose diff adds behaviour to a source file before adding it to a test file was not
  written test-first. Commit order should show it.
- Bug fixes start with a test that reproduces the bug. If you cannot reproduce it in a
  test, you do not yet understand it well enough to fix it.
- If a piece of code is hard to test, that is a design signal — usually a missing port or
  an aggregate reaching for I/O. Fix the design, do not reach for heavy mocking.

## Coverage policy

Enforced by Vitest `thresholds` in each package's config, so `pnpm check` fails on a
drop. This is a ratchet enforced by the tool, not by review.

| Scope | Floor |
|---|---|
| Every package, global | **80%** — statements, branches, functions, lines |
| `apps/api/src/domain/**` | **95%** |
| `apps/api/src/application/**` | **95%** |

```ts
// apps/api/vitest.config.ts
coverage: {
  provider: 'v8',
  thresholds: {
    statements: 80, branches: 80, functions: 80, lines: 80,
    'src/domain/**':      { statements: 95, branches: 95, functions: 95, lines: 95 },
    'src/application/**': { statements: 95, branches: 95, functions: 95, lines: 95 },
  },
}
```

The domain bar is high because that layer is pure functions with no I/O — the money
arithmetic, the cycle boundary rules, the allocation chain. It is both the part most worth
defending and the cheapest to cover. There is no excuse for a gap there.

**Raise a threshold only when the measured coverage backing it has actually gone up.**
Never set one aspirationally, and never lower one to make a PR pass.

```bash
pnpm turbo run test -- --coverage
```

## What to test, by layer

### `apps/api/src/domain` — the priority

Pure. No database, no HTTP, no clock. These tests are cheap, fast and are the ones that
matter most. Anything with a rule behind it belongs here.

Every rule documented in `docs/DOMAIN_MODEL.md` needs a matching test case. A rule with no
test is a rule nobody can verify.

Table-driven, names stating the rule in plain language:

```ts
describe('CycleRef', () => {
  it.each([
    ['anchor lands on a weekday',      '2026-08-05', '2026-08-05'],
    ['anchor on a Saturday moves back','2026-08-01', '2026-07-31'],
    ['anchor exceeds the month length','2026-02-31', '2026-02-28'],
  ])('%s', (_name, nominal, expected) => {
    expect(CycleRef.resolve(nominal, PRECEDING).start).toEqual(date(expected));
  });

  it('tiles the calendar with no gap between consecutive cycles', () => {
    const august = CycleRef.forMonth('2026-08', anchor(5));
    const september = august.next();

    expect(september.start).toEqual(august.end.plusDays(1));
  });

  // Named for the month it is SPENT in, so it opens on the previous month's
  // payday: with pay on the 5th, August 2026 runs 3 Jul – 4 Aug.
  it('is named for the month after its payday', () => {
    const august = CycleRef.forMonth('2026-08', anchor(5));

    expect(august.start).toEqual(date('2026-07-03'));
    expect(august.end).toEqual(date('2026-08-04'));
  });
});
```

Non-negotiable cases for this domain:

- **`Money`** — rounding, the last-instalment remainder, never losing a cent.
- **`CycleRef`** — weekend and holiday shifts, short months, tiling with no gap or overlap,
  and the naming offset across every anchor day. Tiling in particular must be
  proven across all 31 anchor days and both policies, not on a handful of
  examples: a naming rule can look right on day 5 and lose a month on day 16.
- **Cycle assignment** — an invoice due date landing in a different cycle from its
  purchases (the `UC-5.4` example is a required test case).
- **The calculation chain** — `surplus`, `expectedSurplus`, `netSurplus`, with and without
  estimates.
- **Allocation** — percentages over 100%, priority funding when money runs short.
- **Bucket event folds** — contribution, yield and correction in sequence.

### `apps/api/src/application` — interactors

Test with in-memory fake repositories and a fixed `Clock`, not mocks of Prisma. Cover the
orchestration and the failure branches: not-found, invalid state transitions, a closed
cycle rejecting a write.

Write **fakes, not mocks**. A `InMemoryCycleRepository` implementing the port is reusable
and readable; a stack of `vi.mock` calls is neither.

### `apps/api/src/infrastructure` — thin, DB-backed

Prisma repository tests need a live PostgreSQL, so they are skipped unless `DATABASE_URL`
is set and `pnpm db:up` is running. Keep them to SQL that logic depends on — filters,
ordering, joins — not re-testing Prisma itself.

### `apps/api/src/interface` — the wiring

Handlers are thin, so test what can break: status codes for bad input, and the DTO shape.

### `apps/web` — Vitest + Testing Library

Tests live next to the code as `*.test.ts(x)`, jsdom environment.

Test **behaviour the user sees**, through queries a user would use — not props, not state:

```tsx
it('flags the date the balance goes negative', () => {
  render(<LedgerTable entries={[salary(18_000_00), invoice(20_000_00, '2026-08-10')]} />);

  expect(screen.getByText('10/08/2026')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('negative');
});
```

- Build fixtures with typed factories that take overrides. No literal object soup.
- `getBy*` when the element must exist, `queryBy*` when asserting absence.
- Mock the network at the `api` client boundary, never deeper.
- Test a feature slice through its public API, the same way the app consumes it.

## What not to test

Framework behaviour, generated Prisma types, trivial getters, Tailwind classes, or the
shape of a DTO that TypeScript already guarantees. A test that restates the implementation
costs maintenance and proves nothing — it also inflates coverage while defending nothing,
which is worse than a gap you can see.
