# Financial Control — Use Cases

A personal finance application replacing a spreadsheet: payday-cycle budgeting, credit-card invoices, and
savings-bucket projections. Single user, no authentication. English UI, Brazilian Real (`R$ 1.234,56`),
`dd/MM/yyyy` dates.

This document is the design brief and the source of scope. It describes **what the app must let its user do**,
screen by screen. It does not prescribe layout, colour or component choices — those live in the Claude Design
project.

---

## 1. The two questions this app exists to answer

Every screen is subordinate to one of these. If a feature serves neither, it is secondary.

> **Q1 — "It's July. How much will I pay in the next cycle, and how much will be left on August 5th?"**
>
> A precise, near-term, date-aware answer. Not an estimate of "monthly spend" — the actual number, with the
> actual dates money leaves the account, and the actual amount surviving to the next payday.

> **Q2 — "What does my future look like?"**
>
> The emergency fund, retirement, the apartment. Where the current savings rate lands in 5, 10, 20, 30 years,
> and whether each goal will be met on time.

The **Dashboard** answers Q1 in a single glance. The **Wealth Projection** answers Q2 in one click.

---

## 2. The core concept: the payday cycle

**The app does not think in calendar months. It thinks in payday cycles.**

A **cycle** runs from one salary date to the day before the next, and is named for **the month it is spent
in** — the month *after* its payday. If salary arrives on the 5th, the cycle named *August 2026* spans
**5 Jul → 4 Aug**; if it arrives on the last day of the month, *August 2026* spans **31 Jul → 30 Aug**. This
matches how the money is actually experienced: an amount arrives, and it must cover everything until the next
amount arrives.

| Situation | Behaviour |
|---|---|
| Payday anchor | A configurable day-of-month (default: 5) |
| Payday falls on a weekend or public holiday | Configurable — pay lands on the *preceding* business day (default) or the following one. The cycle boundary moves with it |
| Anchor day exceeds the month's length (e.g. 31 in February) | Cycle starts on the last day of that month |
| Naming | A cycle is named for the month **after** its payday — the month the money is spent in. *August 2026*, never *July–August* |

**Consequence: every entry carries a due date.** The due date is what assigns an entry to a cycle, and it is
what lets the ledger show a running balance through time rather than a single monthly total. It is also the
source of the app's one genuinely counter-intuitive rule — see UC-5.4.

The app holds a **rolling 12 cycles**: the current one, and eleven projected ahead. Cycle navigation is global,
in the header, and every screen respects the selected cycle.

---

## 3. Vocabulary

The calculation chain, in the order it must always appear:

| Term | Meaning |
|---|---|
| **Opening balance** | Cash carried in from the previous cycle |
| **Fixed income** | Recurring money in — salary |
| **Fixed outcome** | Recurring money out — bills, subscriptions, instalments, card invoices |
| **Variables** | One-off money in or out — a reimbursement, a gift, an unusual expense |
| **Total Outcome** | Sum of all outgoing |
| **Surplus** | Fixed income − Total Outcome |
| **Expected Surplus** | Surplus + Variables — *the amount available to allocate* |
| **Allocations** | Money assigned to buckets |
| **Net Surplus** | Expected Surplus − Allocations — *free cash* |
| **Closing balance** | Opening balance + Net Surplus → becomes the next cycle's opening balance |
| **Bucket** | A pot of savings — either a **goal** with a target, or an **ongoing** monthly commitment |

`Surplus → Expected Surplus → Net Surplus` is one calculation in three stages and the UI must always present it
in that order. Everything in the app is written in English; only currency and date *formatting* are Brazilian.

---

## 4. Use cases

Each use case: an ID, a goal, the screen it lives on, the flow, and the data it shows.

---

### UC-1 — Setup & configuration

Low-frequency. Lives on **Settings**.

**UC-1.1 — Configure the payday anchor**
Set the day of month salary arrives and the weekend/holiday resolution rule. Changing it re-slices every open
cycle, so the app previews the effect — *"moving the anchor to day 7 will move 3 entries out of the current
cycle and shift every projected closing balance"* — and requires confirmation. **Closed cycles are never
re-sliced.**

**UC-1.2 — Manage accounts**
Checking, savings and cash accounts, each with a name, type and balance. Their total is the app's starting
cash and is visible permanently in the sidebar (*"In accounts now — R$ 2.160,00 · 3 accounts"*). Balances can
be corrected manually at any time.

**UC-1.3 — Configure credit cards**
Name, limit, **closing day**, **due day**, and the account the invoice is paid from. Because the day pair is
what drives everything downstream, the form shows a plain-language preview:
*"Purchases from 29 Jul to 28 Aug will be billed on the invoice due 10 Sep — the October cycle."*

**UC-1.4 — Review formatting conventions**
Read-only confirmation of how the app renders money, dates, outgoing amounts and cycle names. Not
configurable in v1 — shown so the conventions are explicit.

**UC-1.5 — Follow the first-run checklist**
The app ships empty. An ordered, five-step checklist gets the user to a working state, each step depending on
the ones before: **payday anchor → accounts → credit cards → recurring templates → buckets**. Each step shows
its current state (*"3 accounts"*, *"12 templates"*) and is reachable from here.

**UC-1.6 — Back up and restore**
A full data export and re-import. The user is the only operator and the only backup, and there is no import
path from any bank or spreadsheet — so this is the sole recovery mechanism.

---

### UC-2 — Recurring templates

The engine that fills future cycles. Lives on **Recurring Templates**.

**UC-2.1 — Create a recurring outcome**
Name, amount, **due day of month**, start cycle, optional end cycle. The app generates one entry per cycle
from the start onward. Examples: Health Plan R$ 320 on the 8th, Electricity R$ 280 on the 15th.

**UC-2.2 — Create a recurring income**
Same, for money coming in. Salary is the primary case and is special only in that its date defines the cycle
boundary (UC-1.1).

**UC-2.3 — Edit a template with a scope choice**
The critical interaction. When an amount or date changes, the app asks: **this cycle only**, or **this cycle
and all future**? Past cycles are never touched.

*Why it matters:* salary is R$ 10.000 through August and R$ 18.000 from September onward. That is one template
with a change applied "this cycle and future" — not two templates, and not twelve manual edits.

**UC-2.4 — Attach a value schedule**
For a recurring item whose amount is known to change on a schedule, the user enters *(from cycle, amount)*
pairs and the app applies each from its cycle onward. A template carrying one is tagged `value schedule` and
can be expanded in the list to show the steps.

*Why it matters:* Renovation Progress runs 1.200 → 1.250 → 1.300 → 1.340 across four consecutive cycles.

**UC-2.5 — Pause, end or resume a template**
Expenses end. A template can be `active`, `paused`, `ending on <cycle>` or `ended`. Ending one stops future
generation without deleting history; a paused one resumes later with no data loss. Inactive templates stay
in the list, dimmed.

**UC-2.6 — Flag a template as an unconfirmed estimate**
A placeholder the user knows is roughly right but has not verified — *Contractor Costs (to detail)* at
R$ 1.500. Estimates are tagged `~estimate` **everywhere they appear**, and every total in the app can be shown
two ways via a global toggle (UC-4.4). A forecast that silently mixes a guess with a known bill is the failure
mode this exists to prevent.

**UC-2.7 — Review all templates**
One list: name, due day, amount, next occurrence, status, and the `~estimate` / `value schedule` tags.
Sortable by amount. Above it, four figures that summarise the user's commitments:

- **Fixed commitment per cycle** and how many active outcome templates make it up
- **Fixed income per cycle**
- **Unconfirmed estimates** — the total the user is guessing at
- **Ending within 12 cycles** — what is about to fall off, and which

Card invoices appear here as `auto` templates: they exist, but their amount comes from the card, not from a
value the user types.

---

### UC-3 — The cycle ledger

One cycle in full. Lives on **Cycle Ledger**. The screen the user opens most after the Dashboard.

**UC-3.1 — See the calculation chain**
A strip across the top carrying the chain from §3 in order — Opening, Total Outcome, Surplus, Expected
Surplus, Allocations, Net Surplus, Closing — each with a one-line note saying where it came from. This is the
whole model at a glance, and it appears identically on every cycle.

**UC-3.2 — See every entry, dated, with a running balance**
Entries in due-date order, each showing date, description, planned amount, actual amount, status, and **the
balance after it**. This is what makes the ledger answer "when", not just "how much" — cash can bottom out
mid-cycle and recover before the closing balance ever shows a problem.

Entry kinds are distinguishable: `income`, `fixed`, `invoice`, `variable`, `alloc`. Statuses are `received`,
`paid`, `planned`, `projected`, `overdue`, `skipped`.

**UC-3.3 — Navigate to any of the 12 cycles**
Global cycle navigation in the header, tagged `current`, `next` or `projected`, with the date range always
visible. Past and current cycles show what actually happened; projected cycles are generated from templates,
value schedules, instalment schedules and allocation rules.

**UC-3.4 — Add an ad-hoc entry**
A one-off in or out that no template covers: a shared dinner being paid back, a side-project payment, an
unusual bill. Description, amount, due date, direction.

**UC-3.5 — Settle an entry**
Turn a plan into a fact: mark it **paid**, **received** or **skipped**, and record the actual amount if it
differs from the planned one. **This is the most repeated action in the app** — one click when actual equals
planned, two when it does not.

**UC-3.6 — See variance**
Per row, planned against actual where they differ. Per cycle, whether it came out ahead or behind. Only
meaningful for past and current cycles; projected cycles show planned only.

**UC-3.7 — Override a projected value**
Change one cycle's figure without touching the template behind it. Overridden entries are marked and can be
reverted to the projected value in one action.

**UC-3.8 — Close a cycle**
Freezes it: entries become read-only, every unsettled entry must first be settled or skipped, and the closing
balance becomes the next cycle's opening balance. Offered once the cycle's end date has passed, never forced.

**UC-3.9 — Reopen a closed cycle**
Corrections happen. Reopening restores editability and recomputes every downstream opening balance — which the
app must warn about, because reopening a cycle from four cycles back shifts the entire cash curve since.

---

### UC-4 — The Dashboard · **answers Q1**

The screen that justifies the whole payday-cycle model. Lives on **Dashboard**, opens on the current cycle,
and is about the **next** one — the user's question is always asked from the middle of the cycle they are in.

**UC-4.1 — Read the answer as one sentence**
The headline, in plain language:
*"In the August cycle you'll receive R$ 18.000, pay R$ 9.110, and R$ 3.556 stays free after allocations."*
Beside it, the three numbers that qualify it: the **lowest point** the balance reaches and the date it happens,
the **closing balance**, and **the closing balance without the unconfirmed estimates**. Everything else on the
screen is evidence for that sentence.

**UC-4.2 — See the four headline figures**
Total Outcome, Expected Surplus, Net Surplus, and the lowest point in the cycle — each with a note explaining
what it is made of.

**UC-4.3 — See where the current cycle stands**
How far through the cycle today is, and how much has actually been spent against what was planned. Two
progress readings side by side; the gap between them is the signal.

**UC-4.4 — Toggle estimates globally**
A single header control switching every figure in the app between **Confirmed only** and **Including
estimates**. Not a per-screen setting — the whole app answers consistently.

**UC-4.5 — Work the upcoming list**
The next obligations by date, each settleable inline. Overdue items are called out with how late they are and
a prominent settle action. This is the fastest path to UC-3.5, which is why it sits on the landing screen.

**UC-4.6 — Glance at the buckets**
Each bucket as a compact chip: current balance, and either progress toward its target (goal buckets) or its
per-cycle contribution (ongoing buckets). One click through to UC-6.

**UC-4.7 — Read the alerts**
The things that need attention, ranked by severity:

- an entry from a past cycle still unsettled, blocking that cycle from closing
- a **projected negative balance** on a specific date in a future cycle, naming what caused it
- a card invoice about to close, and which cycle purchases will roll into
- an unconfirmed estimate materially changing a closing balance, quantified both ways
- a bucket behind its target date, or an ongoing bucket's annual cost worth being aware of

---

### UC-5 — Credit cards & invoices

Lives on **Cards & Invoices**. The two cards together are a large fraction of all spending, so this is not a
side feature.

**UC-5.1 — Register a purchase**
Date, description, amount, card, and number of instalments (default 1). The app decides which invoice it
belongs to from the card's closing day.

**UC-5.2 — Split a purchase into instalments**
An instalment purchase creates one item on each of `N` consecutive invoices, each labelled with its position —
`3/10`. The user registers it once; the app schedules the rest and **retires the purchase automatically** when
the last instalment is billed.

*Why it matters:* the spreadsheet carried instalments as manual rows whose counters were incremented by hand
and which needed manual deletion when they finished.

**UC-5.3 — View an invoice**
Itemized: every purchase and instalment, the total, the closing date, the due date, and status
(`open` / `closed` / `paid`). An open invoice updates as purchases are added; a closed one is fixed.

**UC-5.4 — Understand which cycle an invoice hits**
An invoice appears as a single outcome in **the cycle containing its due date** — frequently not the cycle its
purchases were made in. The app must make this legible rather than surprising.

> **Worked example.** Payday is the 5th. The Inter card closes on the 28th and is due on the 10th.
>
> - A purchase on **20 Aug** falls before the 28 Aug closing → invoice **due 10 Sep**. 10 Sep sits in the cycle
>   running 4 Sep → 4 Oct, which is named for the month it is spent in, so it is paid in the **October cycle**.
> - A purchase on **29 Aug** falls *after* the closing → invoice **due 10 Oct**, in the **November cycle**.
>   Nine days later on the calendar, an entire cycle later in cash terms.
>
> The purchase form therefore shows, live: *"This will be billed 10 Sep, in the October cycle."*

**UC-5.5 — Pay an invoice**
Settle it from its linked account, recording the amount actually paid. Behaves identically to UC-3.5 in the
ledger.

**UC-5.6 — Pay off instalments early**
Anticipate the remaining instalments of a purchase, optionally with a discount. Future invoices recalculate.

**UC-5.7 — Register a refund**
A negative purchase — a returned item or a chargeback — reducing the invoice total and shown distinctly.

**UC-5.8 — See a card's committed future**
Per card: limit, current open invoice, available limit, and **the total already committed to future invoices**
from instalments. That last figure is the one the spreadsheet could not produce and the strongest argument for
modelling cards properly.

---

### UC-6 — Buckets & goals

Lives on **Buckets & Goals**. A bucket is a pot of savings fed by a rule each cycle.

**UC-6.1 — Choose what kind of bucket it is**
Every bucket is either:

| Mode | Meaning | Shown as |
|---|---|---|
| **Goal** | A target amount by a target date | Progress toward the target, and the date it will actually be reached |
| **Ongoing** | A per-cycle amount with no end and nothing to "complete" | Share of total contributions, and its annual cost |

This distinction runs through the whole screen. An emergency fund is a goal — six months of fixed costs by a
date. A construction top-up or a brokerage contribution is ongoing: there is no finish line, only the question
of whether the rate is right. Reporting progress toward a target that does not exist is the failure this
prevents.

**UC-6.2 — Set the allocation rule**
Either a **percentage of Expected Surplus** or a **fixed amount** per cycle. The form shows the effect of each
in the other's terms — *"20 % → R$ 1.778,00 in the August cycle"*, or *"R$ 1.778,00 → 20,0 % of August's
Expected Surplus"* — so the choice is made with both readings visible.

**UC-6.3 — Set the priority order**
`#n of N`, lowest funded first. Decides who gets paid when Expected Surplus does not cover every rule.

**UC-6.4 — Be warned when the rules exceed the money**
When percentages plus fixed amounts run past Expected Surplus in a given cycle, the app says so concretely —
naming the cycle, the shortfall, and **which buckets the priority order would actually fund**. A negative
Expected Surplus must be handled explicitly, not silently produce negative contributions.

**UC-6.5 — Override one cycle's contribution**
Put in a different amount this once, without changing the rule. The rule is a default, not a constraint —
the spreadsheet's percentage formulas were overridden constantly.

**UC-6.6 — Compare planned against real**
Two curves per bucket: what the rules said should have accumulated, and what is actually there. The gap
between them is the honest picture.

**UC-6.7 — Read the full event history**
Every bucket is an append-only log, and the balance is the fold over it. Five event kinds, visually distinct:

| Event | Meaning |
|---|---|
| **Contribution** | The rule applied for a cycle |
| **Override** | A deliberate different amount for one cycle, with what the rule would have said |
| **Yield** | Interest or returns — growth from returns, never confused with growth from saving |
| **Correction** | The balance set to an observed figure, **reason required** |
| **Withdrawal** | Money taken out, with a reason |

*Why it matters:* the spreadsheet hard-coded balances over its own running total whenever reality drifted,
leaving no trace of why — and it could not tell a deposit from accrued interest.

**UC-6.8 — Close a completed goal**
Archive an achieved-and-spent bucket with its history intact rather than deleting it. Archived buckets are
dimmed, excluded from projections, and still readable.

**UC-6.9 — Change the split going forward**
Adjust rules effective from a chosen cycle without rewriting history. Past cycles keep whatever actually went
in.

**UC-6.10 — See when a goal completes**
For goal buckets: current balance, target, percent complete, and the projected completion date — flagged when
it falls later than the target date, with the contribution increase that would close the gap.

---

### UC-7 — Wealth projection · **answers Q2**

Lives on **Wealth Projection**. Deliberately coarser than the ledger: it models **buckets only**, never
individual bills, and reasons in years.

**UC-7.1 — Set an expected yield per bucket**
An expected annual return, adjustable inline. It is an assumption and must be labelled as one everywhere it
influences a number.

**UC-7.2 — Project net worth over decades**
Totals at **5, 10, 20 and 30 years**, assuming current contribution rules continue and each bucket compounds
at its expected yield. Stacked by bucket, so the *composition* of future wealth is visible, not just the total.

**UC-7.3 — Read the answer per bucket**
One plain sentence each, in the bucket's own terms:

- **Goal:** *"At R$ 1.778 per cycle and 8 % a year, the Apartment reaches R$ 150.000 in March 2031. Target:
  March 2031."* — tagged `on track` or `behind`, and when behind, the contribution that would fix it.
- **Ongoing:** *"At R$ 1.778 per cycle and 9 % a year, Investments holds R$ 142k in 5 years and R$ 331k in 10.
  No target to hit — the question is only whether the rate is right."*

**UC-7.4 — Test the assumptions**
Adjust a yield or a contribution rate and watch the projection move. The point is not precision — it is
seeing how sensitive a thirty-year number is to a two-percent assumption.

**UC-7.5 — See the retirement picture**
Projected balance at retirement, and **what sustainable monthly income that balance supports**. Retirement is
measured in monthly income, not in a lump sum, because that is the question actually being asked.

---

## 5. Screens

Seven screens. Every use case above maps to exactly one.

### Dashboard — *the answer to Q1*
Opens on the current cycle, speaks about the next. Headline sentence; the qualifying trio (lowest point,
closing, closing without estimates); four KPI tiles; cycle progress against spend progress; the upcoming list
with inline settle; bucket chips; alerts.
*Primary action:* settle the next due entry. → UC-4

### Cycle Ledger
The calculation-chain strip, then every entry in due-date order with a running balance, planned/actual and
status. Global cycle navigation.
*Primary action:* settle an entry. *Secondary:* add an ad-hoc entry, close the cycle. → UC-3

### Cards & Invoices
Card list with limit, open invoice, available and committed-to-future. Selecting a card shows its invoices;
selecting an invoice shows it itemized with instalment positions and refunds.
*Primary action:* register a purchase. *Secondary:* pay an invoice. → UC-5

### Buckets & Goals
Bucket cards showing balance and either goal progress or ongoing share. Selecting one shows planned-vs-real
curves, its rule configuration, and the full event history.
*Primary action:* adjust the allocation rule. *Secondary:* override this cycle. → UC-6

### Wealth Projection — *the answer to Q2*
Stacked net-worth bars at 5/10/20/30 years, per-bucket assumptions adjustable inline, one plain sentence per
bucket, and the retirement figure as monthly income.
*Primary action:* adjust an assumption. → UC-7

### Recurring Templates
Four summary figures, then the full list with due day, amount, next occurrence, status and tags. Value
schedules expand in place.
*Primary action:* create a template. *Secondary:* edit one, with the scope choice. → UC-2

### Settings
Payday anchor with its change preview, weekend rule, card configuration, accounts, formatting reference,
first-run checklist, backup and restore.
*Primary action:* none — visited rarely, deliberately. → UC-1

**Persistent shell:** a sidebar carrying navigation and the live "In accounts now" total, and a header
carrying the screen title, global cycle navigation, and the estimates toggle.

---

## 6. Cross-cutting design notes

- **Planned and actual are always both present.** Every amount has a planned value and, once it happens, an
  actual one. Future entries have only a planned value; the design needs one consistent way to show both.

- **Estimates must never masquerade as facts.** `~estimate` tagging is consistent everywhere, and the global
  toggle (UC-4.4) makes every total answerable both ways.

- **Money is unambiguous.** BRL, two decimals, monospace for figures so columns align. Outgoing money is
  negative in the domain; sign and colour treatment is uniform across every screen.

- **The cycle is not a month.** Any date range shown states its actual bounds (*5 Aug – 4 Sep*), never a bare
  month name.

- **Settling is the most repeated action.** One click when actual equals planned, two when it does not, and
  reachable from the Dashboard without opening the ledger.

- **Empty states matter.** The app ships with no data and has no import path. First run is the ordered
  checklist in UC-1.5.

- **Single user, no login.** No account menus, no sharing, no permission states.

---

## 7. Out of scope

Recorded as decisions, not oversights:

- **Categories.** Entries are description and amount. There is no category field, no category tree, no
  categorization rules, and no AI classification.
- **Reports and insights.** No spend-by-category, savings-rate trend, top movers or year summary. The
  Dashboard alerts (UC-4.7) are the only analysis the app performs.
- **A forecast grid.** Twelve cycles are modelled and navigable one at a time, but there is no
  all-cycles-at-once table and no what-if scenarios.
- **Bank statement import** (CSV / OFX) and **spreadsheet migration**. All data is entered by hand or
  generated from templates.
- **Asset-level investment holdings** and live market data. Buckets hold a balance, not positions.
- **Multi-user, authentication, sharing.**
