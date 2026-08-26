-- FIN-148 — repair templates stored with a sign that contradicts their
-- direction.
--
-- RecurringTemplate.create did not couple the two, so the Profile form (which
-- sends a magnitude and a direction separately) stored outgoing bills as
-- positive. `direction` decides entryKind, and the chain sums totalOutcome
-- over FIXED entries, so a positive OUT template generated an entry that
-- added money to the cycle instead of taking it out.
--
-- FIN-147 makes the aggregate settle the sign, which stops new rows. This
-- rewrites the ones already stored.
--
-- Only the sign moves: the magnitude the user typed was never in question.
-- Zero is left alone — it is refused on the way in, and a repair is not the
-- place to start rejecting stored data.
--
-- Both statements are idempotent: the predicate is false once the row is
-- correct, so re-running changes nothing.

UPDATE "recurring_templates"
SET "baseAmountCents" = -"baseAmountCents"
WHERE ("direction" = 'OUT' AND "baseAmountCents" > 0)
   OR ("direction" = 'IN'  AND "baseAmountCents" < 0);

UPDATE "value_schedule_steps" AS s
SET "amountCents" = -s."amountCents"
FROM "recurring_templates" AS t
WHERE s."templateId" = t."id"
  AND ((t."direction" = 'OUT' AND s."amountCents" > 0)
    OR (t."direction" = 'IN'  AND s."amountCents" < 0));

-- The entries those templates already generated.
--
-- An entry is its own aggregate and this does NOT rewrite them wholesale. It
-- repairs only entries that are still pure projections of the template that
-- made them:
--
--   * originKind = FROM_TEMPLATE — never a manual entry, and never an
--     OVERRIDE, which disagrees with its template on purpose (UC-3.7)
--   * status = PENDING or OVERDUE — a settled entry is a fact, and a fact is
--     not something a migration gets to rewrite
--   * the cycle is OPEN — a closed cycle rejects every mutation, and its
--     closing balance has already been chained forward
--   * the sign contradicts the template's direction
--
-- Anything failing one of those keeps its amount. Without this the templates
-- would read correctly on Profile while the cycles they feed went on
-- reporting the wrong totalOutcome, which is the number the whole app exists
-- to answer.
--
-- actualCents is untouched throughout: it only exists on a settled entry,
-- which this does not select.

UPDATE "ledger_entries" AS e
SET "plannedCents" = -e."plannedCents"
FROM "recurring_templates" AS t, "cycles" AS c
WHERE e."originRef" = t."id"
  AND e."originKind" = 'FROM_TEMPLATE'
  AND e."cycleId" = c."id"
  AND c."status" = 'OPEN'
  AND e."status" IN ('PENDING', 'OVERDUE')
  AND ((t."direction" = 'OUT' AND e."plannedCents" > 0)
    OR (t."direction" = 'IN'  AND e."plannedCents" < 0));

-- A wrong figure surviving all four conditions — settled, overridden, or in a
-- closed cycle — is corrected by an override the user confirms (UC-3.7),
-- which is the path that exists for exactly this.

-- Not reversible: the pre-repair state is "some rows had the wrong sign", and
-- negating them back would corrupt the rows that were always right.
