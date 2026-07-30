# Financial Control — Domain Model

Companion to [`USE_CASES.md`](./USE_CASES.md). Where that document describes what the user does, this one
describes how the system is structured so it stays true to it.

**Stack:** React + Vite frontend (Feature-Sliced Design) · Node.js backend (classical DDD) · PostgreSQL + Prisma.

---

## 1. Bounded contexts

| Context | Responsibility | Use cases |
|---|---|---|
| **Budgeting** *(core)* | Cycles, ledger entries, recurring templates, the calculation chain | UC-2, UC-3 |
| **Cards** | Cards, invoices, purchases, instalment plans | UC-5 |
| **Allocation & Goals** | Buckets, allocation rules, contributions, yields, corrections | UC-6 |
| **Projection** *(read models)* | Dashboard, alerts, wealth projection | UC-4, UC-7 |

Contexts communicate through application services and domain events, never by reaching into each other's
aggregates. **Cards** publishes `InvoiceClosed` carrying a due date and a total; **Budgeting** consumes it and
materialises a ledger entry. Budgeting knows nothing about purchases.

**Authentication is not a context.** It guards the app rather than modelling any part of it — see the `User`
aggregate in §3. No other aggregate carries a user reference.

**Projection is read-only.** It never mutates. Every view it produces is derived from the other three
contexts, which keeps the numbers honest by construction — there is no separate "forecast data" that can drift
from reality.

---

## 2. The cycle — the model's spine

Everything hangs off the payday cycle. Getting this right first is what makes the rest simple.

```
CycleRef
  anchorDay        : 1–31            // configured payday, e.g. 5
  start            : LocalDate       // resolved, e.g. 2026-08-05
  end              : LocalDate       // day before next payday, e.g. 2026-09-04
  label            : "August 2026"   // named for the month its payday falls in
```

**Resolution rules**, implemented once in `CycleRef` and nowhere else:

1. The nominal start is `anchorDay` of the cycle's month.
2. If `anchorDay` exceeds the month's length, use the last day of the month.
3. If the resulting date is a weekend or public holiday, shift by the configured policy (`PRECEDING` by
   default, `FOLLOWING` optional).
4. `end` is the day before the next cycle's resolved start. Cycles tile the calendar with no gap and no
   overlap — an invariant worth an explicit test.

### The assignment rule

> **An entry belongs to the cycle whose date range contains its due date.**
>
> For a credit card invoice, the **due date decides** — not the dates of the purchases on it.

Stated once here, implemented once in `CycleRef.contains(date)`, never re-derived. UC-5.4 is the user-facing
explanation of the same rule.

---

## 3. Aggregates

### `Cycle` — aggregate root · Budgeting

Owns its ledger entries and its computed chain. The consistency boundary for "what happens in one cycle".

```
Cycle
  id, ref: CycleRef
  status          : OPEN | CLOSED
  openingBalance  : Money            // previous cycle's closing balance
  entries         : LedgerEntry[]
```

```
LedgerEntry                          // entity within Cycle
  id
  description     : string
  kind            : INCOME | FIXED | INVOICE | VARIABLE | ALLOCATION
  dueDate         : LocalDate        // decides cycle membership
  amount          : PlannedActual    // planned, actual, status
  isEstimate      : boolean          // UC-2.6 — unconfirmed placeholder
  origin          : Manual
                  | FromTemplate(RecurringTemplateId)
                  | FromInvoice(InvoiceId)
                  | FromAllocation(BucketId)
                  | Override(originalOrigin, projectedAmount)   // UC-3.7
```

**Invariants**
- A `CLOSED` cycle rejects every mutation.
- A cycle cannot close while any entry is unsettled — each must be `PAID`, `RECEIVED` or `SKIPPED`.
- Every entry's `dueDate` falls inside `ref`.
- `closingBalance` is derived, never stored as an independently editable field.

**Balance chaining.** `closingBalance` becomes the next cycle's `openingBalance`. Reopening a closed cycle
(UC-3.9) invalidates every subsequent opening balance; the application layer recomputes the chain forward and
the UI warns first.

**Running balance.** The ledger's per-row balance (UC-3.2) is a fold over entries sorted by `dueDate`, computed
twice — once including estimates and once without — to serve the global toggle (UC-4.4). It is derived on
read, never stored.

### `RecurringTemplate` — aggregate root · Budgeting

The generator for future cycles.

```
RecurringTemplate
  id, name
  direction       : IN | OUT
  dueDayOfMonth   : 1–31
  valueSchedule   : { fromCycle: CycleRef, amount: Money }[]   // UC-2.4
  startCycle      : CycleRef
  endCycle        : CycleRef?
  status          : ACTIVE | PAUSED | ENDED
  isEstimate      : boolean
```

`valueSchedule` makes UC-2.3 (the salary step from 10.000 to 18.000) and UC-2.4 (a renovation cost climbing
1.200 → 1.340) the same mechanism rather than two features. Editing "this cycle and future" appends a schedule
entry; editing "this cycle only" writes an `Override` onto the generated `LedgerEntry` and leaves the template
alone.

Generation is **lazy and idempotent**: materialising a cycle asks every active template for its entry, keyed by
`(templateId, cycleRef)`, so re-running never duplicates.

### `Card` — aggregate root · Cards

```
Card
  id, name, limit: Money
  closingDay, dueDay : 1–31
  paymentAccount     : AccountId
  invoices           : Invoice[]
  installmentPlans   : InstallmentPlan[]
```

```
Invoice                              // entity within Card
  id
  periodStart, periodEnd : LocalDate // driven by closingDay
  dueDate                : LocalDate // drives cycle assignment
  status                 : OPEN | CLOSED | PAID
  items                  : InvoiceItem[]

InvoiceItem
  purchaseId, description
  amount        : Money              // negative for a refund (UC-5.7)
  installment   : InstallmentRef?    // 3 of 10

InstallmentPlan
  purchaseId, totalInstallments, remaining
  amountPerInstallment : Money
  firstInvoiceId
```

**Invariants**
- A `CLOSED` invoice accepts no new items.
- An instalment plan's items sum to the original purchase amount — the last instalment absorbs the rounding
  remainder, so cents never vanish.
- A plan self-retires when `remaining` reaches zero (UC-5.2).

**Events**: `InvoiceClosed { cardId, invoiceId, total, dueDate }` → Budgeting creates an `INVOICE` kind
`LedgerEntry` with `origin = FromInvoice`, in the cycle containing `dueDate`.

### `Bucket` — aggregate root · Allocation & Goals

```
Bucket
  id, name, colour, purpose
  mode            : GOAL | ONGOING          // UC-6.1
  target          : Money?                  // GOAL only, required
  targetDate      : LocalDate?              // GOAL only, required
  allocationRule  : PercentOfExpectedSurplus(Percentage) | FixedAmount(Money)
  priority        : int                     // funding order when money is short
  expectedYield   : Percentage?             // UC-7.1, annual, an assumption
  status          : ACTIVE | ARCHIVED
  events          : BucketEvent[]
```

```
BucketEvent      // append-only; the balance is a fold over this list
  = Contribution      { cycle, amount }
  | Override          { cycle, amount, ruleWouldHaveBeen: Money }  // UC-6.5
  | YieldRecorded     { date, amount }                             // UC-6.7
  | BalanceCorrection { date, newBalance, reason: NonEmptyString } // UC-6.7
  | Withdrawal        { date, amount, reason: NonEmptyString }
```

**`mode` is a real invariant, not a display flag.** A `GOAL` bucket must have both `target` and `targetDate`;
an `ONGOING` bucket must have neither. Progress, percent-complete and projected-completion are undefined for
`ONGOING` and the type system should make asking for them impossible — reporting progress toward a target that
does not exist is the specific bug UC-6.1 prevents.

Making the event log the source of truth answers the spreadsheet's weakest point: it hard-coded balances over
its own running total whenever reality drifted, leaving no trace of why, and could not distinguish accrued
interest from a deposit. Here a correction carries a mandatory reason and sits alongside the contributions it
supersedes.

**Invariants**
- `BalanceCorrection.reason` and `Withdrawal.reason` are non-empty.
- A withdrawal cannot drive the balance below zero.
- Archiving preserves the full event history (UC-6.8) and removes the bucket from projections.

### `Account` — aggregate root · Budgeting

```
Account
  id, name, type: CHECKING | SAVINGS | CASH
  balance : Money
```

Their sum is the app's starting cash and the sidebar total (UC-1.2).

### `User` — aggregate root · not a bounded context

Authentication **guards** the app; it is not part of the money model. There is no `Auth` context, no user
reference on any other aggregate, and nothing in Budgeting, Cards, Allocation or Projection knows a user
exists. There is one account and everything in the database belongs to it.

```
User
  id
  username     : Username        // unique, compared case-insensitively
  name         : string          // display only
  passwordHash : PasswordHash
```

**Invariants**
- `PasswordHash` can only be constructed from an already-hashed value. The type makes storing a plaintext
  password a compile error rather than something review has to catch.
- `Username` is non-empty and trimmed.
- The aggregate never hashes or verifies anything itself — it takes the `PasswordHasher` port. The domain
  does not import a crypto library, and does not know what Argon2 or a JWT is.

**No registration.** The single user is seeded (UC-0.1). There is no create-user use case, so an orphan
interactor in `application/auth/` would be a bug.

---

## 4. Value objects

| Type | Notes |
|---|---|
| `Money` | **Integer cents, BRL.** Never a float, never `number` arithmetic on reais. Prisma column `BigInt` or `Decimal(19,4)`. Accumulated float drift is the specific failure the spreadsheet had |
| `CycleRef` | Anchor day, resolved start/end, label. Owns the weekend and short-month rules and `contains(date)` |
| `PlannedActual` | `{ planned: Money, actual: Money?, status: PENDING \| PAID \| RECEIVED \| SKIPPED \| OVERDUE }`. Variance is derived; a projected entry has no actual |
| `Percentage` | Basis points internally, so `33,33 %` is exact |
| `InstallmentRef` | `{ number, total }`, renders as `3/10` |
| `DateRange` | Inclusive of both bounds, as cycles are |

---

## 5. The calculation chain

Domain rules, not spreadsheet formulas. Names match §3 of the use-case document exactly. Implemented on
`Cycle` as pure derivations with no persisted duplicates:

```
totalIncome     = Σ entries where kind = INCOME
totalOutcome    = Σ entries where kind ∈ { FIXED, INVOICE } and outgoing variables
variables       = Σ entries where kind = VARIABLE            (signed)

surplus         = totalIncome − totalOutcome
expectedSurplus = surplus + variables
allocations     = Σ entries where kind = ALLOCATION
netSurplus      = expectedSurplus − allocations
closingBalance  = openingBalance + netSurplus
```

Every total is computable two ways — **confirmed only** and **including estimates** — so UC-4.4's global
toggle needs no second code path.

**Allocation resolution**, per cycle:

1. Compute `expectedSurplus`.
2. For each `ACTIVE` bucket in `priority` order, apply a cycle override if one exists, otherwise its
   `allocationRule`.
3. If the total exceeds `expectedSurplus`, fund in priority order and raise a warning naming the cycle, the
   shortfall and which buckets were actually funded (UC-6.4).
4. If `expectedSurplus` is negative, allocate nothing. Never produce a negative contribution.

---

## 6. Ports

Declared in the domain, implemented in infrastructure. The domain never imports a driver.

| Port | Implementation |
|---|---|
| `CycleRepository`, `RecurringTemplateRepository`, `CardRepository`, `BucketRepository`, `AccountRepository`, `UserRepository` | Prisma |
| `Clock` | Real clock in production, fixed clock in tests. Nothing in the domain calls `new Date()` |
| `HolidayCalendar` | Brazilian public holidays, for the payday resolution rule |
| `PasswordHasher` | Argon2id. `hash(plain)` and `verify(plain, hash)` — the algorithm is an infrastructure choice and swapping it must not touch a line of domain code |
| `TokenIssuer` | JWT, signed with `JWT_SECRET` and delivered to the browser in an httpOnly cookie. The domain issues *claims*; it does not know the token format |

---

## 7. Layer layout

### Backend

```
src/
  domain/
    auth/             user.ts, username.ts, password-hash.ts
    budgeting/        cycle.ts, ledger-entry.ts, recurring-template.ts, cycle-ref.ts, account.ts
    cards/            card.ts, invoice.ts, installment-plan.ts
    goals/            bucket.ts, bucket-event.ts, allocation-rule.ts
    shared/           money.ts, percentage.ts, planned-actual.ts, date-range.ts
    ports/            clock.ts, holiday-calendar.ts, repositories.ts,
                      password-hasher.ts, token-issuer.ts

  application/        one interactor per use case, named for its id
    auth/             uc-0-1-log-in.ts, uc-0-3-log-out.ts
    budgeting/        uc-3-5-settle-entry.ts, uc-3-8-close-cycle.ts, …
    cards/            uc-5-1-register-purchase.ts, uc-5-2-split-installments.ts, …
    goals/            uc-6-5-override-contribution.ts, uc-6-7-correct-balance.ts, …
    projection/       uc-4-build-dashboard.ts, uc-4-7-build-alerts.ts,
                      uc-7-project-wealth.ts

  infrastructure/
    prisma/           schema.prisma, migrations/, repositories/, mappers/
    crypto/           argon2-password-hasher.ts
    auth/             jwt-token-issuer.ts
    clock/  holidays/

  interface/
    http/             controllers/, routes/, dto/
```

Naming interactors after use-case ids keeps the traceability that makes these two documents worth having:
every id in `USE_CASES.md` has exactly one file, and an orphan in either direction is a visible bug.

### Frontend

Feature-Sliced Design. Layers import only downward; slices within a layer never import each other. Both rules
are enforced by `eslint-plugin-boundaries` — see `.claude/architecture.md`.

```
src/
  app/         providers, router, global styles, the persistent shell
  pages/       login/ dashboard/ ledger/ cards/ buckets/ wealth/ templates/ settings/
  widgets/     chain-strip/ upcoming-list/ alert-list/ bucket-event-log/ wealth-bars/
  features/    auth/ settle-entry/ register-purchase/ override-contribution/
               adjust-allocation-rule/ toggle-estimates/ navigate-cycle/
  entities/    cycle/ ledger-entry/ card/ invoice/ bucket/ template/ account/
  shared/      ui/ api/ lib/ config/
```

The backend's contexts and the frontend's `entities` layer name the same nouns deliberately. Shared
request/response types live in `packages/contracts` and are the only coupling between the two apps.
