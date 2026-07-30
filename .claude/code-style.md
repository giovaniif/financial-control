# Code style

Two rules govern everything: **everything is written in English**, and **comments are the
exception**.

## 1. English

Identifiers, types, function names, test names, commit messages, branch names, comments,
all repository documentation, and everything written *about* the code — Linear issue
titles and descriptions, PR titles and PR descriptions.

**The UI is English too.** There is no Portuguese product copy anywhere: the app has one
user, and the working agreement is that the whole surface is English.

The only exception is **formatting**, which is locale rather than language: money renders
as `R$ 1.234,56` and dates as `dd/MM/yyyy`.

### Domain vocabulary

The calculation chain is `surplus → expectedSurplus → netSurplus`: income minus outcomes,
plus variable items, minus bucket allocations. Use those names exactly, in the domain, the
database columns, the API contract and the UI labels, as `docs/USE_CASES.md` §3 defines
them. Do not invent synonyms — `leftover`, `remaining` and `available` all mean one of
these three and blur which.

The spreadsheet this replaces was written in Portuguese. None of that vocabulary carries
over into code:

| Spreadsheet | Code |
|---|---|
| Sobra / Sobra Esperada / Sobra Real | `surplus` / `expectedSurplus` / `netSurplus` |
| Reserva | `reserve` |
| Investimentos | `investments` |
| Aposentadoria | `retirement` |
| Apartamento | `apartment` |
| Parcela | `installment` |
| Convênio, Energia, Claro | user-entered data, not identifiers |

Bucket names and entry descriptions are **data**, not code. The user types whatever they like
there.

## 2. Comments only when they earn their place

Write one when a reader who understands the language still cannot work out **why** the code
is the way it is:

- A non-obvious invariant a future edit would break.
- A workaround for external behaviour, naming the cause.
- A business rule whose source is outside the code (`docs/USE_CASES.md`, the spreadsheet).

Good — every one is load-bearing:

```ts
// The last instalment absorbs the rounding remainder so the plan's items
// always sum to the original purchase amount exactly.
const last = total.minus(perInstallment.times(count - 1));
```

```ts
// An invoice belongs to the cycle containing its DUE date, not its purchases'
// dates — a purchase made one day after closing shifts a whole cycle. See UC-5.4.
const cycle = cycles.containing(invoice.dueDate);
```

Bad — delete these on sight:

```ts
// Build the entry map
const entryMap = new Map<EntryId, LedgerEntry>();

// Add 20% to the reserve bucket
reserve.contribute(expectedSurplus.percent(20));
```

The second is a comment doing an identifier's job. Prefer a named constant, a named helper
or a clearer variable name — a comment is what you reach for when naming genuinely cannot
carry the meaning.

## TypeScript

- `strict` everywhere, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- **No `any`.** Narrow `unknown` with a type guard.
- Prefer `type` for unions and function shapes, `interface` for object contracts that may
  be extended.
- Discriminated unions over optional-field soup. `BucketEvent` is a union with a `kind`
  discriminant, not one type with six nullable fields.
- Exhaustive `switch` on unions with a `never` default — adding a variant should break the
  build everywhere it must be handled.
- Named exports only. No default exports, anywhere.
- File names: `kebab-case.ts`, except React components which are `PascalCase.tsx`.

## Domain code

- **Value objects validate in their constructor** and are immutable. Construction either
  produces a valid object or throws.
- **Factory methods over constructors** where intent matters: `Money.fromCents(1234)`,
  `Money.fromReais('12,34')`, `CycleRef.forMonth('2026-08', anchor)`.
- **Errors are domain types**, not strings: `class CycleAlreadyClosed extends DomainError`.
  The interface layer maps them to status codes; the domain never knows about HTTP.
- **No primitive obsession.** A function taking `(number, string, string)` should take
  `(Money, CycleRef, Description)`. This domain has too many numbers that mean different
  things for raw `number` to be safe.
- Aggregates expose intent-revealing methods — `cycle.settle(entryId, actual)`, not
  `cycle.entries[i].status = 'PAID'`.

## React

- Function components, named exports, one per file.
- Props typed inline or as a local `Props` type; no `React.FC`.
- Server state via TanStack Query; local UI state via `useState`. Never `useEffect` for
  fetching.
- Styling is Tailwind utility classes inline. No CSS modules, no styled-components.
- Reach for the `shared/ui` primitives before writing another bespoke button.
- Accessibility is not optional: real semantic elements, labelled inputs, `role="alert"`
  on the warnings that matter (a negative balance date is exactly such a warning).
