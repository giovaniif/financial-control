# Delivery roadmap

Every row becomes a Linear issue in team **Financial Control** (`FIN-`), estimated at creation time as
`.claude/workflow.md` requires. Estimates are Fibonacci and **nothing exceeds 3** — anything larger was split,
which is what makes each issue a single reviewable PR.

Phases are dependency-ordered. Within a phase, issues are listed bottom-to-top in **stack order**: the order
they should be created as Graphite branches, each PR green on its own.

`UC` references point at [`USE_CASES.md`](./USE_CASES.md).

---

## Phase 0 — Foundation

No product behaviour. Everything here exists so that phase 1 can be written test-first with CI enforcing it.

| # | Issue | Est | UC |
|---|---|---|---|
| 0.1 | pnpm workspace + Turborepo task graph + shared tsconfig bases | 3 | — |
| 0.2 | `packages/eslint-config`: flat configs, strict-type-checked, Prettier at 80 cols | 3 | — |
| 0.3 | `eslint-plugin-boundaries`: encode DDD layers and FSD layers, prove a violation fails | 3 | — |
| 0.4 | Vitest setup with the 80 % global / 95 % domain coverage thresholds | 2 | — |
| 0.5 | `packages/contracts` scaffold | 1 | — |
| 0.6 | `apps/api` skeleton: DDD folders, HTTP server, health check | 2 | — |
| 0.7 | `apps/web` skeleton: Vite, FSD folders, Tailwind, host binding for Tailscale | 3 | — |
| 0.8 | Prisma + Supabase: datasource with pooled `DATABASE_URL` and direct `DIRECT_URL` | 2 | — |
| 0.9 | `ci.yml`: path-filtered lint / typecheck / test+coverage / build | 3 | — |
| 0.10 | `deploy.yml` + `render.yaml`: main → dev, `v*` → prod, migrations before start | 3 | — |

**Subtotal 25.** 0.3 is the one worth care — if the boundary rules are wrong, every later phase drifts.

---

## Phase 0.5 — Authentication

The app is deployed on the public internet, so it is locked before anything worth protecting exists. Added
after phase 0 was planned: the original specification put authentication out of scope, and 0.5.0 is the issue
that corrects the specification rather than letting the code contradict it.

One account, seeded. No registration, no roles, no password reset.

| # | Issue | Est | UC |
|---|---|---|---|
| 0.5.0 | Amend the specification to include authentication | 2 | UC-0 |
| 0.5.1 | Prisma `User` model and migration | 2 | UC-0.1 |
| 0.5.2 | `User` aggregate, `Username` / `PasswordHash`, hasher and token ports | 3 | UC-0.1 |
| 0.5.3 | Log-in interactor | 3 | UC-0.1, 0.3 |
| 0.5.4 | Argon2 hasher, JWT issuer, Prisma user repository | 3 | UC-0.1 |
| 0.5.5 | Auth routes and the default-deny guard on everything else | 3 | UC-0.1–0.3 |
| 0.5.6 | Seed the single user, wire the secrets and the same-origin rewrite | 2 | UC-0.1 |
| 0.5.7 | Login page and the `features/auth` slice | 3 | UC-0.1, 0.3 |
| 0.5.8 | Protect the routes, restore the requested screen after login | 2 | UC-0.2, 0.4 |

**Subtotal 23.** 0.5.5 is the one worth care — the guard is default-deny, so a route added later is protected
because it exists, not because someone remembered.

---

## Phase 1 — The cycle spine

Pure domain, no I/O. Written strictly test-first; this is the 95 %-coverage layer and the part the whole app
rests on.

| # | Issue | Est | UC |
|---|---|---|---|
| 1.1 | `Money` value object — integer cents, arithmetic, rounding, `fromReais` parsing | 2 | §3 |
| 1.2 | `Percentage`, `DateRange`, `InstallmentRef` value objects | 2 | §3 |
| 1.3 | `PlannedActual` value object — planned, actual, status, derived variance | 2 | UC-3.6 |
| 1.4 | `Clock` and `HolidayCalendar` ports + Brazilian holiday implementation | 2 | UC-1.1 |
| 1.5 | `CycleRef` — anchor resolution, weekend/holiday shift, short months, `contains` | 3 | §2 |
| 1.6 | `CycleRef` tiling invariant — consecutive cycles with no gap or overlap | 2 | §2 |
| 1.7 | `LedgerEntry` entity — kinds, origins, estimate flag, settle transitions | 3 | UC-3.2 |
| 1.8 | `Cycle` aggregate — the calculation chain, both estimate variants | 3 | §3 |
| 1.9 | `Cycle` running balance fold, with and without estimates | 2 | UC-3.2 |
| 1.10 | `Account` aggregate | 1 | UC-1.2 |

**Subtotal 22.**

---

## Phase 2 — Persistence and the first API

| # | Issue | Est | UC |
|---|---|---|---|
| 2.1 | Prisma schema + migration: accounts, cycles, ledger entries | 3 | — |
| 2.2 | Cycle and Account repositories + mappers (domain objects in, domain objects out) | 3 | — |
| 2.3 | Settings interactors + API: payday anchor with re-slice preview | 3 | UC-1.1 |
| 2.4 | Accounts interactors + API | 2 | UC-1.2 |
| 2.5 | Read a cycle: chain, entries, running balance | 3 | UC-3.1, 3.2 |
| 2.6 | Cycle navigation: the rolling 12, `current`/`next`/`projected` tagging | 2 | UC-3.3 |

**Subtotal 16.**

---

## Phase 3 — Recurring templates

| # | Issue | Est | UC |
|---|---|---|---|
| 3.1 | `RecurringTemplate` aggregate + lifecycle (active / paused / ending / ended) | 3 | UC-2.5 |
| 3.2 | `valueSchedule` — resolve the amount for a given cycle | 3 | UC-2.3, 2.4 |
| 3.3 | Lazy idempotent generation of entries into a cycle | 3 | UC-2.1 |
| 3.4 | Prisma schema + repository for templates | 2 | — |
| 3.5 | Create / edit templates with the *this cycle only vs. this and future* choice | 3 | UC-2.3 |
| 3.6 | Estimate flag end to end, and the confirmed-vs-including totals it feeds | 2 | UC-2.6 |
| 3.7 | Template list summary: commitment, income, estimates, ending within 12 | 2 | UC-2.7 |

**Subtotal 18.**

---

## Phase 4 — Ledger actions

| # | Issue | Est | UC |
|---|---|---|---|
| 4.1 | Settle an entry — paid / received / skipped, actual amount | 2 | UC-3.5 |
| 4.2 | Add an ad-hoc entry | 2 | UC-3.4 |
| 4.3 | Override a projected value, and revert to projected | 2 | UC-3.7 |
| 4.4 | Close a cycle — unsettled guard, balance chaining forward | 3 | UC-3.8 |
| 4.5 | Reopen a closed cycle — recompute downstream openings, warn first | 3 | UC-3.9 |

**Subtotal 12.**

---

## Phase 5 — Cards and invoices

| # | Issue | Est | UC |
|---|---|---|---|
| 5.1 | `Card` aggregate + invoice period derivation from closing day | 3 | UC-1.3 |
| 5.2 | `Invoice` entity, lifecycle open → closed → paid | 2 | UC-5.3 |
| 5.3 | `InstallmentPlan` — split across N invoices, last absorbs the remainder | 3 | UC-5.2 |
| 5.4 | `InvoiceClosed` event → ledger entry in the cycle containing the **due date** | 3 | UC-5.4 |
| 5.5 | Prisma schema + repository for cards, invoices, purchases | 3 | — |
| 5.6 | Register a purchase, with the live "billed on X, in the Y cycle" preview | 3 | UC-5.1, 5.4 |
| 5.7 | Pay an invoice from its linked account | 2 | UC-5.5 |
| 5.8 | Early payoff of remaining instalments | 2 | UC-5.6 |
| 5.9 | Refunds as negative items | 1 | UC-5.7 |
| 5.10 | Committed-to-future-invoices total per card | 2 | UC-5.8 |

**Subtotal 24.** 5.4 is the highest-risk issue in the project — it is the rule everything else misreads.

---

## Phase 6 — Buckets and allocation

| # | Issue | Est | UC |
|---|---|---|---|
| 6.1 | `Bucket` aggregate with `GOAL` / `ONGOING` modes as a type-level invariant | 3 | UC-6.1 |
| 6.2 | `BucketEvent` append-only log + balance as a fold | 3 | UC-6.7 |
| 6.3 | Allocation rules: percent of Expected Surplus, or fixed amount | 2 | UC-6.2 |
| 6.4 | Priority funding when Expected Surplus is short, plus the negative case | 3 | UC-6.3, 6.4 |
| 6.5 | Per-cycle contribution override, recording what the rule would have said | 2 | UC-6.5 |
| 6.6 | Yield, correction (reason required) and withdrawal events | 3 | UC-6.7 |
| 6.7 | Prisma schema + repository for buckets and events | 2 | — |
| 6.8 | Planned-vs-real curves | 2 | UC-6.6 |
| 6.9 | Archive a completed goal | 1 | UC-6.8 |
| 6.10 | Rule changes effective from a chosen cycle | 2 | UC-6.9 |
| 6.11 | Goal completion projection and the contribution that closes a gap | 3 | UC-6.10 |

**Subtotal 26.**

---

## Phase 7 — Projection read models

Read-only, derived from phases 1–6. No new persistence.

| # | Issue | Est | UC |
|---|---|---|---|
| 7.1 | Dashboard read model: headline, the qualifying trio, four KPIs | 3 | UC-4.1, 4.2 |
| 7.2 | Cycle progress against spend progress | 2 | UC-4.3 |
| 7.3 | Upcoming list with overdue detection | 2 | UC-4.5 |
| 7.4 | Alerts engine — the five kinds, ranked by severity | 3 | UC-4.7 |
| 7.5 | Wealth projection: compounding per bucket at 5 / 10 / 20 / 30 years | 3 | UC-7.2 |
| 7.6 | Per-bucket projection sentence, goal vs ongoing phrasing | 2 | UC-7.3 |
| 7.7 | Retirement balance expressed as sustainable monthly income | 2 | UC-7.5 |

**Subtotal 17.**

---

## Phase 8 — Frontend

Each page is its own issue and its own PR, stacked on the shared layers below it.

| # | Issue | Est | UC |
|---|---|---|---|
| 8.1 | `shared/ui` kit + BRL and date formatting in one place | 3 | §6 |
| 8.2 | `shared/api` client, query keys factory, TanStack Query provider | 2 | — |
| 8.3 | App shell: sidebar with live accounts total, header with cycle nav | 3 | §5 |
| 8.4 | Global estimates toggle wired through every total | 2 | UC-4.4 |
| 8.5 | `entities/cycle` and `entities/ledger-entry` | 2 | — |
| 8.6 | `entities/card`, `entities/invoice`, `entities/bucket`, `entities/template` | 3 | — |
| 8.7 | `features/settle-entry` | 2 | UC-3.5 |
| 8.8 | Dashboard page | 3 | UC-4 |
| 8.9 | Ledger page: chain strip, dated rows, running balance | 3 | UC-3 |
| 8.10 | Ledger actions in the UI: ad-hoc entry, override, close, reopen | 3 | UC-3.4, 3.7–3.9 |
| 8.11 | Templates page with value-schedule expansion | 3 | UC-2 |
| 8.12 | Cards page: card list, invoice detail, instalment positions | 3 | UC-5 |
| 8.13 | `features/register-purchase` with the cycle preview | 2 | UC-5.1 |
| 8.14 | Buckets page: cards, planned-vs-real curves, rule config | 3 | UC-6 |
| 8.15 | Bucket event log widget | 2 | UC-6.7 |
| 8.16 | Wealth page: stacked bars, inline assumptions, retirement figure | 3 | UC-7 |
| 8.17 | Settings page: anchor, weekend rule, accounts, cards, formatting | 3 | UC-1.1–1.4 |
| 8.18 | First-run checklist and empty states | 3 | UC-1.5 |
| 8.19 | Backup and restore | 2 | UC-1.6 |

**Subtotal 49.**

---

## Totals

| Phase | Issues | Points |
|---|---|---|
| 0 — Foundation | 10 | 25 |
| 0.5 — Authentication | 9 | 23 |
| 1 — Cycle spine | 10 | 22 |
| 2 — Persistence & first API | 6 | 16 |
| 3 — Recurring templates | 7 | 18 |
| 4 — Ledger actions | 5 | 12 |
| 5 — Cards & invoices | 10 | 24 |
| 6 — Buckets & allocation | 11 | 26 |
| 7 — Projection read models | 7 | 17 |
| 8 — Frontend | 19 | 49 |
| **Total** | **94** | **232** |

## Sequencing notes

- **Phase 0.5 comes before anything is publicly reachable.** `main` deploys to dev on merge, so the lock
  ships before the data does.
- **Phases 0 → 1 → 2 are strictly serial.** Everything after phase 2 can move in parallel tracks: cards
  (phase 5) and buckets (phase 6) touch different aggregates and never block each other.
- **Phase 7 needs 3, 5 and 6 done** — the dashboard and the alerts read from all of them.
- **Frontend can start at 8.1–8.6 as soon as phase 0 lands**, against `packages/contracts` types before the
  API exists. Pages need their API, so 8.8 waits on phase 7, 8.9 on phase 4, and so on.
- **The seam between backend and frontend is always a stack boundary**, so a feature that spans both is at
  minimum two issues — which is why they are listed in separate phases rather than as vertical slices.

## A walking skeleton first

If the full phase 0 feels like a lot before anything is visible, a thinner first slice is defensible:
0.1, 0.2, 0.4, 0.6, 0.7, 0.9 → 1.1, 1.5, 1.8 → 2.1, 2.2, 2.5 → 8.1, 8.3, 8.9. That is one cycle rendering
real data from a real database, end to end, in roughly 40 points — and it proves the architecture before the
remaining 170 points are spent on it.
