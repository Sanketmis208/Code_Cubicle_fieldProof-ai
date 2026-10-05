-- Lets a crashed analysis (stuck in PROCESSING) be reclaimed after a timeout.
ALTER TABLE "Asset" ADD COLUMN "analysisStartedAt" TIMESTAMP(3);
