-- CreateEnum
CREATE TYPE "BucketMode" AS ENUM ('GOAL', 'ONGOING');

-- CreateEnum
CREATE TYPE "BucketStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AllocationRuleKind" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "BucketEventKind" AS ENUM ('CONTRIBUTION', 'OVERRIDE', 'YIELD', 'CORRECTION', 'WITHDRAWAL');

-- CreateTable
CREATE TABLE "buckets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT '',
    "mode" "BucketMode" NOT NULL,
    "targetCents" BIGINT,
    "targetDate" DATE,
    "ruleKind" "AllocationRuleKind" NOT NULL,
    "ruleBasisPoints" INTEGER,
    "ruleFixedCents" BIGINT,
    "priority" INTEGER NOT NULL,
    "expectedYieldBasisPoints" INTEGER,
    "status" "BucketStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buckets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bucket_events" (
    "id" TEXT NOT NULL,
    "bucketId" TEXT NOT NULL,
    "kind" "BucketEventKind" NOT NULL,
    "cycleMonth" TEXT,
    "occurredOn" DATE,
    "amountCents" BIGINT,
    "newBalanceCents" BIGINT,
    "ruleWouldHaveBeenCents" BIGINT,
    "reason" TEXT,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "bucket_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bucket_events_bucketId_idx" ON "bucket_events"("bucketId");

-- CreateIndex
CREATE UNIQUE INDEX "bucket_events_bucketId_sequence_key" ON "bucket_events"("bucketId", "sequence");

-- AddForeignKey
ALTER TABLE "bucket_events" ADD CONSTRAINT "bucket_events_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "buckets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
