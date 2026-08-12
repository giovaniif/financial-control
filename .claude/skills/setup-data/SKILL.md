---
name: setup-data
description: Set up the app's data from a "Controle Financeiro" spreadsheet. The app has a real import (UC-1.7) — prefer it. Use this skill only when the UI cannot do the job: a sheet whose layout the interpreter does not recognise, historical cycles the rolling window will not reach, or data that has to be materialised as closed cycles with settled entries.
---

# Loading the spreadsheet into the app

**The app imports the spreadsheet itself now.** UC-1.7: the first-run wizard reads the workbook,
shows what it found, asks for what the sheet cannot say, and reconciles the result against the
sheet's own totals. That is the path to use.

- In the app: first run opens the wizard, or Settings → **Run setup again**.
- Over HTTP: `POST /import/spreadsheet` (multipart) returns a `SpreadsheetReading`;
  `POST /import/spreadsheet/apply` takes `{ reading, answers }` and returns the report.

The layout knowledge below lives in code, in
`apps/api/src/application/import/interpret-spreadsheet.ts`, and is covered by tests. Read that file
rather than re-deriving it here.

## When to reach for this skill instead

The UI import is deliberately narrow. Fall back to hand-building a backup document when:

- **The sheet's layout is not the one the interpreter knows.** It keys on the labels
  `Total Gasto`, `Sobra`, `Variáveis`, `Sobra Esperada`, `Sobra Real`, `Salário` and `<bucket> Real`,
  and takes its block boundaries from those rows' own `SUM` formulas. A sheet without them reads
  as empty.
- **History matters.** The import writes templates, and the app holds a rolling twelve cycles, so
  columns behind the current cycle are left out. Loading them means materialising cycles by hand.
- **Cycles need to be closed, or entries settled.** The import produces open, projected cycles only.
- **Real card invoices are wanted.** The import registers cards but not their invoices — the sheet
  records a monthly total, never the purchases behind it, so card rows come across as recurring
  estimates.

If none of those apply, use the UI and stop here.

---

## Hand-building a backup document

`POST /restore` accepts the app's own `BackupDocument` (version 1) and **replaces the entire
dataset**, so it is idempotent and safe to re-run — iterate rather than trying to get it right first
time.

### The one rule that governs everything

> An entry belongs to the cycle whose date range contains its **due date**.

The spreadsheet has no dates in it at all. Every date in the document is therefore something you
asked the user for, or derived from the payday anchor. Do not invent one.

### Reading the sheet

`XlsxSpreadsheetReader` already does this and returns cells with their formulas. Outside the app,
it is a zip of XML:

```python
import zipfile
from xml.etree import ElementTree as ET
M = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
NS = {'m': M[1:-1]}
z = zipfile.ZipFile('Controle Financeiro.xlsx')
shared = [''.join(t.text or '' for t in si.iter(M + 't'))
          for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS)]
```

**Read the formulas (`<f>`), not only the values.** They carry intent the computed number has lost:

| Formula | What it tells you |
|---|---|
| `=AJ26*0.2` | The bucket's allocation rule is 20% of Expected Surplus |
| `=SUM(AH2:AH13)` | Which rows are the fixed outcomes |
| `=21000+AH16` | A **hard-coded balance** — the user overwrote a running total. Ask how to seed it |
| `=AF17+AF20` | Confirms `Sobra Esperada = Sobra + Variáveis` |

Do not assume a bill sits on a fixed row across the sheet: `Evoluçao Obra` moves between rows 6 and
7 partway along. Key on the label. And take the block ranges from the `SUM` formulas of *every*
column, not the first one that has them — a bucket added halfway through only appears in the
`Sobra Real` formulas from that column onward.

### Ask. Do not guess.

None of this is in the spreadsheet. Batch it into as few `AskUserQuestion` calls as possible.

**The column-to-cycle mapping** needs no question: a column heading already means the month the
money is *spent* in, which is what a cycle is named for, so `Agosto` maps onto `2026-08`. Do not
shift by one. Do state the mapping with its resolved date ranges before loading, so a wrong year is
caught early — the sheet names months but never years.

**The payday anchor.** Day of month and the shift policy (`PRECEDING` or `FOLLOWING`; there is no
"never shift"). For a last-day-of-month payday the anchor day is **31**, not 30: it clamps to each
month's length, while 30 misses the 31st of the long months. Show the resolved boundaries rather
than describing them.

**A due day for every fixed bill.** The single biggest source of wrongness — cycle totals survive a
bad guess, the running balance and the low-water mark do not. Watch for a day that falls in a
**gap**: with a cycle running 31 Aug – 29 Sep, day 30 exists in neither month, so the template
silently generates nothing. Say so and offer the cycle's last day.

**Cards.** Closing day, due day, limit, and the account each is paid from. Then show the
consequence, because it is the app's one genuinely counter-intuitive rule (UC-5.4).

**Buckets.** Goal or ongoing. A goal needs a target amount *and* a target date — the mode is a hard
invariant and a goal without a date is rejected. Users routinely give the amount and forget the
date; ask again.

**Seeding a bucket balance** where the sheet hard-codes one: offer a withdrawal, a correction, or
opening at the current figure, and let the user choose. If they open at the current figure and that
money paid the cycle's bills, **warn them** — the outflows are recorded but the cash that covered
them is not, so the ledger runs negative. The honest alternative is to seed at the old balance,
record a withdrawal, and add a matching variable income for the transfer.

**Accounts.** Names, types and balances. At least one is required.

### Building it

`packages/contracts/src/backup.ts` is the authority — read it rather than trusting a summary. Money
is **integer cents**: `round(reais * 100)`, never a float.

Outgoing is negative. `INCOME` positive; `FIXED`, `INVOICE` and `ALLOCATION` negative; `VARIABLE`
signed. Invoice items positive, negative only for a refund.

Origins are what keep generation idempotent — a materialised cycle is filled again from the
templates on every read, and `generateInto` keys on the template behind an entry:

| Entry | Origin |
|---|---|
| from a recurring template | `{ kind: 'FROM_TEMPLATE', ref: templateId }` |
| a card invoice | `{ kind: 'FROM_INVOICE', ref: invoiceId }` |
| a bucket allocation | `{ kind: 'FROM_ALLOCATION', ref: bucketId }` |
| anything one-off | `{ kind: 'MANUAL' }` |

Amounts that step across months are **one template with a `valueSchedule`** (UC-2.4), not several
templates. A bill that stops gets an `endMonth`. A placeholder the user is guessing at gets
`isEstimate: true`.

Invariants that will reject the document: every entry's due date must fall inside its cycle; a
`GOAL` needs a target and a `ONGOING` must not have one; correction and withdrawal reasons must be
non-empty; a withdrawal cannot drive a balance below zero. Opening balances chain by hand — the app
only chains on close, so a cycle nobody has closed opens at zero.

### Restore, then reconcile

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3333/restore \
  -H 'Content-Type: application/json' --data-binary @backup.json    # expect 204
```

A `400` carries the aggregate's own message, usually precise enough to fix directly.

Reconciling is not optional. Read every loaded cycle back and check the app's computed chain against
the spreadsheet's own cells:

| App figure | Spreadsheet cell |
|---|---|
| `totalOutcome` | `Total Gasto` |
| `surplus` | `Sobra` |
| `expectedSurplus` | `Sobra Esperada` |
| `netSurplus` | `Sobra Real` |

Then say plainly what is **not** right, rather than only what loaded: columns that were blank, due
dates you had to move, cycles opening at zero because nothing has been closed, negative running
balances, anything left at a placeholder. A figure that quietly differs from the spreadsheet is
worse than one that is missing.
