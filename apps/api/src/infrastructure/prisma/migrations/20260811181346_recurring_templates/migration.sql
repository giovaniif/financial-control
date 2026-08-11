-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED');

-- CreateTable
CREATE TABLE "recurring_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "direction" "Direction" NOT NULL,
    "dueDayOfMonth" INTEGER NOT NULL,
    "baseAmountCents" BIGINT NOT NULL,
    "startMonth" TEXT NOT NULL,
    "endMonth" TEXT,
    "status" "TemplateStatus" NOT NULL DEFAULT 'ACTIVE',
    "isEstimate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "value_schedule_steps" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "fromMonth" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,

    CONSTRAINT "value_schedule_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "value_schedule_steps_templateId_fromMonth_key" ON "value_schedule_steps"("templateId", "fromMonth");

-- AddForeignKey
ALTER TABLE "value_schedule_steps" ADD CONSTRAINT "value_schedule_steps_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "recurring_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
