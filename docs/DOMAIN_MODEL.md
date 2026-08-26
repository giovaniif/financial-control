# Financial Control — Domain Model

Companion to [`USE_CASES.md`](./USE_CASES.md). Where that document describes what the user does, this one
describes how the system is structured so it stays true to it.

**Stack:** React + Vite frontend (Feature-Sliced Design) · Node.js backend (classical DDD) · PostgreSQL + Prisma.

---

## 1. Bounded contexts

| Context | Responsibility | Use cases |
|---|---|---|
| **Budgeting** *(core)* | Cycles, ledger entries, recurring templates, the calculation chain | UC-2, UC-3 |
| **Allocation & Goals** | Buckets, allocation rules, contributions, yields, corrections | UC-6 |
| **Projection** *(read models)* | Dashboard, wealth projection | UC-4, UC-7 |
| **Assistant** *(read models + intent)* | Answering from the app's own figures; proposing changes for the user to confirm | UC-1.5, UC-8 |

Contexts communicate through application services and domain events, never by reaching into each other's
aggregates.

**Projection is read-only.** It never mutates. Every view it produces is derived from the other two
contexts, which keeps the numbers honest by construction — there is no separate "forecast data" that can drift
from reality.

**Assistant reads the same way, and writes nothing.** It answers out of the read models rather than out of
figures of its own, so an answer and the screen behind it cannot disagree. What it cannot do is act: a change
it suggests stays a `ProposedChange` until the user confirms it, and is then applied by the interactor that
already implements that use case. It owns no aggregate and stores nothing of its own — §6 is why.

---

## 2. The cycle — the model's spine

Everything hangs off the payday cycle. Getting this right first is what makes the rest simple.

```
CycleRef
  anchorDay        : 1–31            // configured payday, e.g. 5
  start            : LocalDate       // resolved, e.g. 2026-07-03
  end              : LocalDate       // day before next payday, e.g. 2026-08-04
  label            : "August 2026"   // named for the month AFTER its payday
```

**Resolution rules**, implemented once in `CycleRef` and nowhere else:

0. A cycle is named for the month it is **spent** in, so it opens on the *previous* month's payday and closes
   the day before this month's. The offset is applied to the nominal month, never derived from the dates the
   cycle resolved to — naming by the end date, or by whichever month holds most of the days, both break the
   one-cycle-per-month mapping. With pay on the 2nd, 2 May 2026 is a Saturday, so two cycles would end in
   April and none in May; with pay on the 16th, February is short enough that no cycle falls mostly inside it.
1. The nominal start is `anchorDay` of the month before the cycle's own.
2. If `anchorDay` exceeds the month's length, use the last day of the month.
3. If the resulting date is a weekend or public holiday, shift by the configured policy (`PRECEDING` by
   default, `FOLLOWING` optional).
4. `end` is the day before the next cycle's resolved start. Cycles tile the calendar with no gap and no
   overlap — an invariant worth an explicit test.

### The assignment rule

> **An entry belongs to the cycle whose date range contains its due date.**

Stated once here, implemented once in `CycleRef.contains(date)`, never re-derived.

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
  kind            : INCOME | FIXED | VARIABLE | ALLOCATION
  dueDate         : LocalDate        // decides cycle membership
  amount          : PlannedActual    // planned, actual, status
  isEstimate      : boolean          // UC-2.6 — unconfirmed placeholder
  origin          : Manual
                  | FromTemplate(RecurringTemplateId)
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
twice — once including estimates and once without. It is derived on read, never stored.

Both readings outlived the global toggle that first asked for them (UC-4.4, removed). Main answers *including
estimates* and states the closing balance both ways beside the headline, and the assistant can be asked for
either — so a guess still cannot pass for a known bill (UC-2.6, UC-8.2).

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

Making the event log the source of truth answers the weakest point of the spreadsheet this app replaced: it
hard-coded balances over its own running total whenever reality drifted, leaving no trace of why, and could
not distinguish accrued interest from a deposit. Here a correction carries a mandatory reason and sits
alongside the contributions it supersedes.

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

---

## 4. Value objects

| Type | Notes |
|---|---|
| `Money` | **Integer cents, BRL.** Never a float, never `number` arithmetic on reais. Prisma column `BigInt` or `Decimal(19,4)`. Accumulated float drift is the specific failure the spreadsheet this app replaced had |
| `CycleRef` | Anchor day, resolved start/end, label. Owns the weekend and short-month rules and `contains(date)` |
| `PlannedActual` | `{ planned: Money, actual: Money?, status: PENDING \| PAID \| RECEIVED \| SKIPPED \| OVERDUE }`. Variance is derived; a projected entry has no actual |
| `Percentage` | Basis points internally, so `33,33 %` is exact |
| `DateRange` | Inclusive of both bounds, as cycles are |

---

## 5. The calculation chain

Domain rules, not the spreadsheet formulas they replaced. Names match §3 of the use-case document exactly.
Implemented on `Cycle` as pure derivations with no persisted duplicates:

```
totalIncome     = Σ entries where kind = INCOME
totalOutcome    = Σ entries where kind = FIXED and outgoing variables
variables       = Σ entries where kind = VARIABLE            (signed)

surplus         = totalIncome − totalOutcome
expectedSurplus = surplus + variables
allocations     = Σ entries where kind = ALLOCATION
netSurplus      = expectedSurplus − allocations
closingBalance  = openingBalance + netSurplus
```

Every total is computable two ways — **confirmed only** and **including estimates** — from one code path.
The API serves either, which is what lets Main state the closing balance both ways and lets the assistant be
asked for one or the other.

**Allocation resolution**, per cycle:

1. Compute `expectedSurplus`.
2. For each `ACTIVE` bucket in `priority` order, apply a cycle override if one exists, otherwise its
   `allocationRule`.
3. If the total exceeds `expectedSurplus`, fund in priority order and raise a warning naming the cycle, the
   shortfall and which buckets were actually funded (UC-6.4).
4. If `expectedSurplus` is negative, allocate nothing. Never produce a negative contribution.

---

## 6. The trust boundary

The assistant is the first part of the system whose output is not the system's own. Everything in §1–§5 holds
because the code that produced a value is the code that validated it. A model's output carries no such
guarantee and cannot be made to.

> **The model produces intent. The domain enforces every invariant.**

A `ProposedChange` is a discriminated union — settle this entry, add this bill, change what a template
charges — and it is a statement of intent, not a change. It is rendered for the user in the app's own
vocabulary, confirmed explicitly, and only then handed to the interactor that already implements that use
case. No path exists from a model response to a repository write that does not pass through a confirmation.

**Validation happens at apply time, not at produce time.** A proposal is built against the figures of the
moment it was produced, and may be confirmed a minute or an hour later. Checking it as it is produced proves
nothing about the state it will land in, so the interactor validates it as it would any other caller's
request: a proposal against data that has since moved fails cleanly rather than writing something wrong.

What follows from that is the rule worth stating outright — **no invariant moves into the assistant.**
Re-checking a closed cycle, a withdrawal below zero or an instalment plan's arithmetic at the point the
proposal is built would leave two places to keep correct, and the second unreachable by the domain tests that
defend the first. The assistant may explain an invariant. It never enforces one.

### Identity is ambient, never an argument

The second rule of this boundary costs nothing today and cannot be added cheaply later.

> **The model never names whose data it reads.**

Tools take domain parameters — which cycle, which bucket — and never an identity. The interactor is
constructed with repositories already scoped to the caller, so the scope is a property of the request rather
than a value the model chose. A `Principal` is passed alongside a question and alongside a confirmation, never
read out of a request body, and it is stamped on a proposal when it is produced.

With one user this is a tautology and every check passes trivially. That is precisely why it has to be built
now. A tool shaped `read_cycle(cycleId)` over a global id space works perfectly until the day a second user
exists, at which point anything able to influence the model — including a bill description, which is
user-entered text that reaches the model as a tool result — can move that id. Prompt injection stops being an
annoyance and becomes exfiltration.

**A tool that cannot express "somebody else's data" cannot be talked into fetching it.** That property is
worth more than any filter placed in front of a model, and the way to keep it is to never write the argument
in the first place. The assistant's tests assert the complete set of argument names across every tool, so a
future tool that adds an identity fails the build rather than passing review.

Authentication remains out of scope (`USE_CASES.md` §7). What this section fixes is that adding it later is a
contained change rather than an audit of everything the model can reach — the checklist for that day lives on
the tracking issue, not here, because it is work to do rather than structure to keep.

---

## 7. Ports

Declared in the domain, implemented in infrastructure. The domain never imports a driver.

| Port | Implementation |
|---|---|
| `CycleRepository`, `RecurringTemplateRepository`, `BucketRepository`, `AccountRepository` | Prisma |
| `Clock` | Real clock in production, fixed clock in tests. Nothing in the domain calls `new Date()` |
| `HolidayCalendar` | Brazilian public holidays, for the payday resolution rule |
| `LanguageModel` | The conversation of UC-1.5 and the assistant of UC-8. Declared in the domain's own vocabulary — a turn, the tools it may call, the result — so nothing above it knows which vendor answers. Implemented in `infrastructure/gemini/`, `infrastructure/anthropic/` and, for free local testing, `infrastructure/ollama/`; faked in tests, so no test needs a key or a network |

`eslint-plugin-boundaries` confines `@anthropic-ai/sdk` to `infrastructure/anthropic/` exactly as it confines
`@prisma/client` to `infrastructure/prisma/`. One adapter file knows the vendor; everything else knows the
port. The Gemini and Ollama adapters need no such rule: both are plain `fetch` over a REST endpoint, so
there is no vendor package to confine in the first place.

**A tool call may carry a `continuation`.** Some providers stamp a call with an opaque token and reject a
transcript that replays the call without it — Gemini's thought signature is the case that forced it, and a
conversation that outlives one request has to carry it. The port says only that the token survives a round
trip; what is inside belongs to the adapter that issued it, which is what keeps the vendor out of every
layer above.

**A missing `ANTHROPIC_API_KEY` is a state, not a crash.** The composition root then wires an implementation
that fails every call with a typed domain error, which the interface layer maps and the UI explains. First run
falls back to a plain form and every screen that is not the chat is unaffected — an app that refused to start
without a key would make the key a precondition for reading your own numbers.

---

## 8. Layer layout

### Backend

```
src/
  domain/
    budgeting/        cycle.ts, ledger-entry.ts, recurring-template.ts, cycle-ref.ts, account.ts
    goals/            bucket.ts, bucket-event.ts, allocation-rule.ts
    shared/           money.ts, percentage.ts, planned-actual.ts, date-range.ts
    ports/            clock.ts, holiday-calendar.ts, language-model.ts, repositories.ts

  application/        interactors named for the use case ids they serve
    budgeting/        uc-3-ledger-actions.ts, uc-3-8-close-cycle.ts, …
    goals/            uc-6-manage-buckets.ts
    projection/       uc-4-build-dashboard.ts, uc-7-project-wealth.ts
    setup/            uc-1-5-converse-setup.ts, setup-draft.ts, compose-setup.ts,
                      setup-document.ts, write-setup-document.ts
    assistant/        uc-8-ask-assistant.ts, uc-8-apply-proposal.ts

  infrastructure/
    prisma/           schema.prisma, migrations/, repositories/, mappers/
    clock/  holidays/  anthropic/  gemini/  ollama/

  interface/
    http/             controllers/, routes/, dto/
```

Naming interactors after use-case ids keeps the traceability that makes these two documents worth having:
every live id in `USE_CASES.md` is served by exactly one file, and an orphan in either direction is a visible
bug.

**One file may serve several ids, and only when they share an aggregate.** `uc-3-ledger-actions.ts` carries
UC-3.4, UC-3.5, UC-3.7 and UC-3.9 because each is a mutation of one `Cycle` behind one consistency boundary,
and splitting them would be four files repeating the same load-mutate-save. The grouping is the aggregate's,
never a convenience: two ids on different aggregates stay in different files, which is why closing a cycle
and reading one each have their own.

### Frontend

Feature-Sliced Design. Layers import only downward; slices within a layer never import each other. Both rules
are enforced by `eslint-plugin-boundaries` — see `.claude/architecture.md`.

```
src/
  app/         providers, router, global styles, the persistent shell
  pages/       main/ profile/ savings/ onboarding/
  widgets/     chain-strip/ upcoming-list/ alert-list/ bucket-event-log/ wealth-bars/
  features/    ask-assistant/ settle-entry/ toggle-estimates/ navigate-cycle/
               configure-anchor/ manage-accounts/ manage-templates/
               manage-buckets/ create-bucket/
  entities/    cycle/ ledger-entry/ bucket/ template/ account/
  shared/      ui/ api/ lib/ config/
```

The backend's contexts and the frontend's `entities` layer name the same nouns deliberately. Shared
request/response types live in `packages/contracts` and are the only coupling between the two apps.
