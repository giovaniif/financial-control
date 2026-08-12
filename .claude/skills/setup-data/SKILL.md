---
name: setup-data
description: Set up the app's data from a "Controle Financeiro" spreadsheet by converting it into a v1 backup document and restoring it. Use when asked to fill in cycle data from the spreadsheet, seed or set up the app from the xlsx, or load July/August/September (or any months) from the sheet this app replaces.
---

# Loading the spreadsheet into the app

The app has **no spreadsheet import** and is never getting one — `docs/USE_CASES.md` §7 rules
it out. `POST /restore` accepts only the app's own backup document (`BackupDocument`,
version 1). This skill does not add an import path. It reads the spreadsheet, asks the
user for everything the spreadsheet cannot tell you, builds a valid backup document and
restores that.

**Restore replaces the entire dataset** (`BackupRestore.restore` calls `clear()` before
loading). So it is idempotent and safe to re-run — iterate freely rather than trying to
get it perfect first time.

## The one rule that governs everything

> An entry belongs to the cycle whose date range contains its **due date**.

The spreadsheet has no dates in it at all. Every date in the backup document is therefore
something you asked the user for, or derived from the payday anchor. Do not invent one.

---

## Step 1 — Read the sheet

No spreadsheet library, and no `pnpm add`. It is a zip of XML:

```python
import zipfile
from xml.etree import ElementTree as ET
M = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
NS = {'m': M[1:-1]}
z = zipfile.ZipFile('Controle Financeiro.xlsx')
shared = [''.join(t.text or '' for t in si.iter(M + 't'))
          for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS)]
```

A cell's value is in `<v>`; if `t="s"` it is an index into `shared`. Convert the column
letters of `r` (e.g. `AH16`) to a number yourself.

**Read the formulas too** (`<f>`), and show them to the user when they matter. Formulas
carry intent that the computed value has lost:

| Formula | What it tells you |
|---|---|
| `=AJ26*0.2` | The bucket's allocation rule is 20% of Expected Surplus |
| `=SUM(AH2:AH13)` | Which rows are the fixed outcomes |
| `=21000+AH16` | A **hard-coded balance** — the user overwrote a running total. Ask how to seed it |
| `=AF17+AF20` | Confirms `Sobra Esperada = Sobra + Variáveis` |

### The layout

Row 1 holds month names in Portuguese, one **column pair** per month: the label in column
`n`, the amount in column `n+1`. Rows carry:

| Rows | Meaning |
|---|---|
| fixed outcome rows | one per bill; the label can move rows between months, so key on the label, not the row |
| card rows | `Nubank`, `Inter` — an invoice total, not a bill |
| `Salário` | income |
| `Total Gasto`, `Sobra` | derived; use them to check your work |
| `Variáveis` + its rows | one-off in/out |
| `Sobra Esperada` | Expected Surplus |
| bucket rows | the allocation **for that cycle** |
| `<bucket> Real` rows | the **running balance**, not a contribution |

Do not assume a bill sits on a fixed row across the sheet — in the sheet read on
11 Aug 2026, `Evoluçao Obra` moved from row 7 to row 6 partway along.

### Work out the year

The sheet names months but never years. Anchor it on today's date and on which column is
partly filled — the current month usually has some cells still blank. State your reasoning
and the resulting mapping to the user before loading anything.

---

## Step 2 — Ask. Do not guess.

None of the following is in the spreadsheet. Ask all of it, batched into as few
`AskUserQuestion` calls as possible, before building anything.

### 2a — The column-to-cycle mapping (nothing to ask)

A cycle is named for the month it is **spent** in, which is what a spreadsheet column
heading already means. So a column maps straight onto the cycle of the same name:

| Column | Cycle | With a last-day anchor |
|---|---|---|
| `Agosto` | `2026-08` | 31 Jul – 30 Aug |
| `Setembro` | `2026-09` | 31 Aug – 29 Sep |

Do not offer the user a choice here, and do not shift the columns by one. An earlier
version of this skill did, because cycles were then named for their *payday* month; that
is no longer true and re-keying correctly keyed data is the error the naming change was
made to remove. Still **state the mapping** you are about to use, with the resolved date
ranges, so a wrong year is caught before anything is loaded.

### 2b — The payday anchor

Day of month, and the weekend/holiday policy (`PRECEDING` or `FOLLOWING` — there is no
"never shift"). Two things to tell the user:

- **For a last-day-of-month payday, the anchor day is 31**, not 30. `resolveStart` clamps
  to the month's length, so 31 gives 30 Jun, 31 Jul, 31 Aug, 30 Sep automatically, while
  30 gives a literal 30th and misses the 31st of the long months.
- The shift still applies. Under `PRECEDING`, Sat 31 Oct 2026 resolves to Fri 30 Oct. Say
  which of the next twelve cycles will shift, so it is not a surprise later.

Then compute and show the actual resolved boundaries rather than describing them.

### 2c — A due day for every fixed bill

The single biggest source of wrongness. Cycle totals survive a bad guess; the running
balance, the low-water mark and the negative-balance warning do not. List every bill with
its amount and ask for the day of month.

Watch for a due day that falls in a **gap**: with a cycle running 30 Jul – 27 Aug, day 28
exists in neither month the cycle spans, and `dueDateIn` returns undefined so the template
silently does not generate. Say so and offer to place it on the cycle's last day.

### 2d — Cards

Closing day, due day and limit per card, plus the account each is paid from. Then show the
consequence in plain language, because it is the app's one genuinely counter-intuitive
rule (UC-5.4): *"closing 31 and due 31 means an invoice closes 31 Jul and falls due
31 Aug, so it lands in the cycle containing 31 Aug — not the one the purchases were in."*

### 2e — Buckets

For each bucket: goal or ongoing. **A goal needs a target amount *and* a target date** —
the mode is a hard invariant, and a goal without a date is rejected. Users routinely give
the amount and forget the date; ask again for it.

Allocation rules can be read off the formulas (`=AJ26*0.2` → 20%). Confirm the priority
order, which decides who gets funded when Expected Surplus falls short.

### 2f — Seeding a bucket balance

Where the sheet hard-codes a balance (`=21000+AH16`), the history is gone. Offer three
ways and let the user choose:

| Option | Effect |
|---|---|
| Withdrawal | Records money leaving with a reason; keeps the earlier balance visible |
| Correction | Sets the observed balance with a mandatory reason; no claim about what moved |
| Open at the current figure | One correction, no history |

If the user takes the third option and the money paid that cycle's bills, **warn them**:
the outflows are recorded but the cash that covered them is not, so the ledger will run
negative. Offer the honest alternative — seed the bucket at its old balance, record a
withdrawal, and add a matching variable income for the transfer.

### 2g — Accounts

Names, types (`CHECKING` / `SAVINGS` / `CASH`) and balances. At least one is required:
every card needs a `paymentAccountId`, and the total is the sidebar's "In accounts now".

---

## Step 3 — Build the document

`packages/contracts/src/backup.ts` is the authority; read it rather than trusting this
table. Money is **integer cents** everywhere — `round(reais * 100)`, never a float.

### Signs

Outgoing is negative in the domain. `INCOME` positive; `FIXED`, `INVOICE` and `ALLOCATION`
negative; `VARIABLE` signed. Invoice **items** are positive, negative only for a refund.

### Origins — this is what keeps generation idempotent

Cycles you materialise are filled again from the templates on every read. `generateInto`
keys on the template behind an entry, so an entry you wrote must carry the origin that
produced it or you get a duplicate:

| Entry | Origin |
|---|---|
| from a recurring template | `{ kind: 'FROM_TEMPLATE', ref: templateId }` |
| a card invoice | `{ kind: 'FROM_INVOICE', ref: invoiceId }` |
| a bucket allocation | `{ kind: 'FROM_ALLOCATION', ref: bucketId }` |
| anything one-off | `{ kind: 'MANUAL' }` |

### Templates, for the cycles you are not materialising

Materialised cycles are historical fact; templates are what project the future. Amounts
that step across months are **one template with a `valueSchedule`**, not several
templates — that is UC-2.4, and it is how a renovation climbing 2.600 → 2.924 should be
modelled. A bill that stops gets an `endMonth`. A placeholder the user is guessing at gets
`isEstimate: true`, which feeds the global confirmed-only toggle.

### Invariants that will reject the document

- Every entry's due date must fall **inside** its cycle. Check each one against the
  resolved boundaries; this is the most common failure.
- A `GOAL` needs `target`; an `ONGOING` must not have one.
- `CORRECTION` and `WITHDRAWAL` reasons must be non-empty.
- A withdrawal cannot drive a balance below zero.
- Opening balances chain by hand here: fold each cycle's net surplus forward yourself.
  The app only chains on close, so a cycle nobody has closed opens at zero.

---

## Step 4 — Restore

```bash
python3 build-backup.py > backup.json
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3333/restore \
  -H 'Content-Type: application/json' --data-binary @backup.json    # expect 204
```

A `400` comes back with the aggregate's own message, which is usually precise enough to
fix directly. Start the API with `pnpm dev` if nothing is listening on 3333.

## Step 5 — Reconcile, then report honestly

Not optional. Read every loaded cycle back and check the app's computed chain against the
spreadsheet's own cells:

```bash
curl -s http://localhost:3333/cycles/2026-08 | python3 -m json.tool
```

| App figure | Spreadsheet cell |
|---|---|
| `totalOutcome` | `Total Gasto` |
| `surplus` | `Sobra` |
| `expectedSurplus` | `Sobra Esperada` |
| `netSurplus` | `Sobra Real` |

Also check `/dashboard` opens on the cycle the user expects, and that `/buckets` and
`/cards` render.

Then tell the user plainly what is **not** right, rather than only what loaded:

- columns that were blank in the sheet, so the cycle is emptier than it looks
- any due date you had to move to keep it inside its cycle
- cycles whose opening balance is zero because nothing has been closed yet
- any negative running balance, and what caused it
- anything left at a placeholder — a zero limit, a zero account balance

A figure that quietly differs from the spreadsheet is worse than one that is missing.
