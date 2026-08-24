-- A credit card is now an ordinary recurring bill: one amount per cycle, on
-- the day the invoice is due. Purchases, instalment plans and per-card limits
-- are no longer modelled, so the four tables behind them go, along with the
-- ledger's INVOICE kind and FROM_INVOICE origin.
--
-- Not reversible: dropping these tables discards every card, invoice, invoice
-- item and instalment plan. Restoring them means restoring a backup (UC-1.6).

-- DropTable
DROP TABLE "invoice_items";

-- DropTable
DROP TABLE "installment_plans";

-- DropTable
DROP TABLE "invoices";

-- DropTable
DROP TABLE "cards";

-- DropEnum
DROP TYPE "InvoiceStatus";

-- Any entry that came from an invoice becomes an ordinary fixed bill kept by
-- hand. There are none of these today, but a migration that silently dropped
-- rows would be a worse answer than one that keeps them readable.
UPDATE "ledger_entries" SET "kind" = 'FIXED' WHERE "kind" = 'INVOICE';
UPDATE "ledger_entries"
SET "originKind" = 'MANUAL', "originRef" = NULL
WHERE "originKind" = 'FROM_INVOICE';
UPDATE "ledger_entries"
SET "overriddenKind" = 'MANUAL', "overriddenRef" = NULL
WHERE "overriddenKind" = 'FROM_INVOICE';

-- AlterEnum: PostgreSQL cannot drop a value from an enum in place, so both are
-- rebuilt without it.
ALTER TYPE "EntryKind" RENAME TO "EntryKind_old";
CREATE TYPE "EntryKind" AS ENUM ('INCOME', 'FIXED', 'VARIABLE', 'ALLOCATION');
ALTER TABLE "ledger_entries"
  ALTER COLUMN "kind" TYPE "EntryKind" USING ("kind"::text::"EntryKind");
DROP TYPE "EntryKind_old";

ALTER TYPE "OriginKind" RENAME TO "OriginKind_old";
CREATE TYPE "OriginKind" AS ENUM ('MANUAL', 'FROM_TEMPLATE', 'FROM_ALLOCATION', 'OVERRIDE');
ALTER TABLE "ledger_entries"
  ALTER COLUMN "originKind" DROP DEFAULT;
ALTER TABLE "ledger_entries"
  ALTER COLUMN "originKind" TYPE "OriginKind" USING ("originKind"::text::"OriginKind"),
  ALTER COLUMN "overriddenKind" TYPE "OriginKind" USING ("overriddenKind"::text::"OriginKind");
ALTER TABLE "ledger_entries"
  ALTER COLUMN "originKind" SET DEFAULT 'MANUAL';
DROP TYPE "OriginKind_old";
