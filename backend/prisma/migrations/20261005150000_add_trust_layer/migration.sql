-- Trust layer (additive): provenance, explained trust checks, event clusters,
-- project sites, review state and a ledger of derived files. Existing rows keep
-- working: new columns are nullable or defaulted (NOT_ASSESSED, PENDING, WEB_UPLOAD).

-- CreateEnum
CREATE TYPE "CaptureSource" AS ENUM ('WEB_UPLOAD', 'WEB_LIVE_CAPTURE', 'APP_CAPTURE');

-- CreateEnum
CREATE TYPE "TrustStatus" AS ENUM ('NOT_ASSESSED', 'STRONG', 'MODERATE', 'NEEDS_SECOND_LOOK');

-- CreateEnum
CREATE TYPE "TrustResult" AS ENUM ('PASS', 'INFO', 'WARN', 'FAIL');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'RESHOOT_REQUESTED');

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "captureSource" "CaptureSource" NOT NULL DEFAULT 'WEB_UPLOAD',
ADD COLUMN     "capturedAtSource" TEXT,
ADD COLUMN     "capturedByName" TEXT,
ADD COLUMN     "cloudinaryAnalysis" JSONB,
ADD COLUMN     "eventClusterId" TEXT,
ADD COLUMN     "exif" JSONB,
ADD COLUMN     "faceCount" INTEGER,
ADD COLUMN     "gpsAccuracyM" DOUBLE PRECISION,
ADD COLUMN     "locationSource" TEXT,
ADD COLUMN     "phash" TEXT,
ADD COLUMN     "publicToken" TEXT,
ADD COLUMN     "qualityScore" DOUBLE PRECISION,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "sha256" TEXT,
ADD COLUMN     "siteId" TEXT,
ADD COLUMN     "trustEvaluatedAt" TIMESTAMP(3),
ADD COLUMN     "trustScore" INTEGER,
ADD COLUMN     "trustStatus" "TrustStatus" NOT NULL DEFAULT 'NOT_ASSESSED';

-- AlterTable
ALTER TABLE "AssetAnalysis" ADD COLUMN     "authenticity" JSONB;

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radiusM" INTEGER NOT NULL DEFAULT 500,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventCluster" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "assetCount" INTEGER NOT NULL DEFAULT 0,
    "representativeIds" JSONB NOT NULL DEFAULT '[]',
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventCluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrustCheck" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "check" TEXT NOT NULL,
    "result" "TrustResult" NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "hard" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "relatedAssetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrustCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DerivedAsset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "sourceAssetIds" JSONB NOT NULL,
    "kind" TEXT NOT NULL,
    "transformation" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DerivedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Site_projectId_idx" ON "Site"("projectId");

-- CreateIndex
CREATE INDEX "EventCluster_projectId_startedAt_idx" ON "EventCluster"("projectId", "startedAt");

-- CreateIndex
CREATE INDEX "TrustCheck_assetId_idx" ON "TrustCheck"("assetId");

-- CreateIndex
CREATE INDEX "DerivedAsset_organizationId_createdAt_idx" ON "DerivedAsset"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "DerivedAsset_projectId_idx" ON "DerivedAsset"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_publicToken_key" ON "Asset"("publicToken");

-- CreateIndex
CREATE INDEX "Asset_sha256_idx" ON "Asset"("sha256");

-- CreateIndex
CREATE INDEX "Asset_projectId_reviewStatus_idx" ON "Asset"("projectId", "reviewStatus");

-- CreateIndex
CREATE INDEX "Asset_eventClusterId_idx" ON "Asset"("eventClusterId");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_eventClusterId_fkey" FOREIGN KEY ("eventClusterId") REFERENCES "EventCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventCluster" ADD CONSTRAINT "EventCluster_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustCheck" ADD CONSTRAINT "TrustCheck_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

