-- Persist richer, retryable media intelligence and evidence-grounded project summaries.
ALTER TABLE "Asset"
  ADD COLUMN "analysisError" TEXT,
  ADD COLUMN "analysisAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastAnalyzedAt" TIMESTAMP(3);

ALTER TABLE "AssetAnalysis"
  ADD COLUMN "detailedDescription" TEXT,
  ADD COLUMN "projectCategoryHints" JSONB,
  ADD COLUMN "visibleSubjects" JSONB,
  ADD COLUMN "infrastructureSignals" JSONB,
  ADD COLUMN "evidenceStrength" TEXT,
  ADD COLUMN "uncertainties" JSONB,
  ADD COLUMN "representativeFrames" JSONB,
  ADD COLUMN "analysisVersion" INTEGER NOT NULL DEFAULT 2;

CREATE TABLE "ProjectInsight" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "documentedActivities" JSONB NOT NULL,
  "locationsRepresented" JSONB NOT NULL,
  "timeSpan" TEXT NOT NULL,
  "recurringObservations" JSONB NOT NULL,
  "evidenceGaps" JSONB NOT NULL,
  "recentActivity" TEXT NOT NULL,
  "uncertaintyNotes" JSONB NOT NULL,
  "sourceEvidenceCount" INTEGER NOT NULL,
  "model" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectInsight_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectInsight_projectId_key" ON "ProjectInsight"("projectId");
ALTER TABLE "ProjectInsight" ADD CONSTRAINT "ProjectInsight_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
