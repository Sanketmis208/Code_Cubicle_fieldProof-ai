-- Members are now added by email (one-time setup link) instead of invite codes.
-- Existing users keep their passwords: passwordSetAt is backfilled from createdAt.
-- Targets and tallies record countable outcomes ("500 saplings") batch by batch.
-- DropForeignKey
ALTER TABLE "Invite" DROP CONSTRAINT "Invite_organizationId_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordSetAt" TIMESTAMP(3),
ADD COLUMN     "phone" TEXT;

-- DropTable
DROP TABLE "Invite";

-- CreateTable
CREATE TABLE "AccountSetup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountSetup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Target" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "targetCount" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Target_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tally" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "siteId" TEXT,
    "eventClusterId" TEXT,
    "note" TEXT,
    "recordedById" TEXT,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tally_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountSetup_tokenHash_key" ON "AccountSetup"("tokenHash");

-- CreateIndex
CREATE INDEX "AccountSetup_userId_idx" ON "AccountSetup"("userId");

-- CreateIndex
CREATE INDEX "Target_projectId_idx" ON "Target"("projectId");

-- CreateIndex
CREATE INDEX "Tally_targetId_recordedAt_idx" ON "Tally"("targetId", "recordedAt");

-- AddForeignKey
ALTER TABLE "AccountSetup" ADD CONSTRAINT "AccountSetup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Target" ADD CONSTRAINT "Target_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tally" ADD CONSTRAINT "Tally_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Target"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tally" ADD CONSTRAINT "Tally_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tally" ADD CONSTRAINT "Tally_eventClusterId_fkey" FOREIGN KEY ("eventClusterId") REFERENCES "EventCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;


UPDATE "User" SET "passwordSetAt" = "createdAt" WHERE "passwordSetAt" IS NULL;
