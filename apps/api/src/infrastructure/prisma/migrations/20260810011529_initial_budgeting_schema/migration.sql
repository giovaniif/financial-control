-- CreateEnum
CREATE TYPE "ShiftPolicy" AS ENUM ('PRECEDING', 'FOLLOWING');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CHECKING', 'SAVINGS', 'CASH');

-- CreateEnum
CREATE TYPE "CycleStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "EntryKind" AS ENUM ('INCOME', 'FIXED', 'INVOICE', 'VARIABLE', 'ALLOCATION');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'PAID', 'RECEIVED', 'SKIPPED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "OriginKind" AS ENUM ('MANUAL', 'FROM_TEMPLATE', 'FROM_INVOICE', 'FROM_ALLOCATION', 'OVERRIDE');

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "anchorDay" INTEGER NOT NULL,
    "shiftPolicy" "ShiftPolicy" NOT NULL DEFAULT 'PRECEDING',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "balance" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cycles" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "status" "CycleStatus" NOT NULL DEFAULT 'OPEN',
    "openingBalance" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "kind" "EntryKind" NOT NULL,
    "plannedCents" BIGINT NOT NULL,
    "actualCents" BIGINT,
    "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING',
    "isEstimate" BOOLEAN NOT NULL DEFAULT false,
    "originKind" "OriginKind" NOT NULL DEFAULT 'MANUAL',
    "originRef" TEXT,
    "overriddenKind" "OriginKind",
    "overriddenRef" TEXT,
    "projectedCents" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cycles_month_key" ON "cycles"("month");

-- CreateIndex
CREATE INDEX "ledger_entries_cycleId_dueDate_idx" ON "ledger_entries"("cycleId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_cycleId_originKind_originRef_key" ON "ledger_entries"("cycleId", "originKind", "originRef");

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
