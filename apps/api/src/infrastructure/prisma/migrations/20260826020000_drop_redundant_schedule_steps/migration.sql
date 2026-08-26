-- FIN-149 — drop value-schedule steps that were never really steps.
--
-- `changeAmount` with "this cycle and all future" appended a step whatever
-- cycle it started from. A step at or before the template's own startMonth is
-- redundant by construction: resolution scans for the latest step at or
-- before a cycle, so such a step wins in every cycle the template can
-- produce and baseAmountCents becomes unreachable.
--
-- The effect was that an ordinary correction (UC-2.3) left a bill branded
-- with the badge meant for a genuinely stepped amount (UC-2.4).
--
-- FIN-149 makes the aggregate set the base amount instead. This folds the
-- steps already written back into it.

-- The step wins over the base today, so its amount is the one to keep. Where
-- several redundant steps exist, the latest is the one currently in effect.
UPDATE "recurring_templates" AS t
SET "baseAmountCents" = latest."amountCents"
FROM (
  SELECT DISTINCT ON (s."templateId")
         s."templateId", s."amountCents"
  FROM "value_schedule_steps" AS s
  JOIN "recurring_templates" AS rt ON rt."id" = s."templateId"
  WHERE s."fromMonth" <= rt."startMonth"
  ORDER BY s."templateId", s."fromMonth" DESC
) AS latest
WHERE t."id" = latest."templateId";

DELETE FROM "value_schedule_steps" AS s
USING "recurring_templates" AS t
WHERE s."templateId" = t."id"
  AND s."fromMonth" <= t."startMonth";

-- Steps that start after the template does are untouched: those are UC-2.4's
-- real schedule and the badge belongs to them.
--
-- Idempotent: once the redundant steps are gone both statements match nothing.
-- Not reversible, and nothing is lost by that — the amounts survive in
-- baseAmountCents, which is where they were always in effect from.
