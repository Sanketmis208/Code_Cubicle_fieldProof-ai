import { z } from "zod";

const signalSchema = z.object({
  type: z.string().trim().min(1).max(100),
  description: z.string().trim().min(2).max(500),
  confidence: z.number().min(0).max(1),
});

export const assetAnalysisSchema = z.object({
  summary: z.string().trim().min(10).max(1200),
  detailedDescription: z.string().trim().min(20).max(3000),
  activity: z.string().trim().min(2).max(160),
  projectCategoryHints: z.array(z.string().trim().min(1).max(80)).max(10),
  locationType: z.string().trim().min(2).max(120).nullable(),
  visibleSubjects: z.array(z.string().trim().min(1).max(100)).max(30),
  environmentalSignals: z.array(signalSchema).max(20),
  infrastructureSignals: z.array(signalSchema).max(20),
  detectedObjects: z.array(z.string().trim().min(1).max(100)).max(50),
  tags: z.array(z.string().trim().min(1).max(50)).max(30),
  evidenceStrength: z.enum(["strong", "moderate", "limited"]),
  imageQuality: z.string().trim().min(2).max(300),
  evidenceUsefulness: z.string().trim().min(2).max(500),
  uncertainties: z.array(z.string().trim().min(2).max(500)).max(20),
  confidence: z.number().min(0).max(1),
});

export const evidenceSearchIntentSchema = z.object({
  queryText: z.string().trim().min(1).max(500),
  projectIds: z.array(z.string()).max(30).default([]),
  activities: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  tags: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  signals: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  dateFrom: z.string().date().nullable().default(null),
  dateTo: z.string().date().nullable().default(null),
  mediaTypes: z.array(z.enum(["IMAGE", "VIDEO", "RAW"])).max(3).default([]),
  locationTerms: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  freeTextTerms: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
});

export const projectInsightSchema = z.object({
  summary: z.string().trim().min(20).max(1800),
  documentedActivities: z.array(z.string().trim().min(2).max(300)).max(30),
  locationsRepresented: z.array(z.string().trim().min(2).max(200)).max(30),
  timeSpan: z.string().trim().min(2).max(300),
  recurringObservations: z.array(z.string().trim().min(2).max(500)).max(30),
  evidenceGaps: z.array(z.string().trim().min(2).max(500)).max(30),
  recentActivity: z.string().trim().min(2).max(1000),
  uncertaintyNotes: z.array(z.string().trim().min(2).max(500)).max(30),
});

export const comparisonAnalysisSchema = z.object({
  summary: z.string().trim().min(20).max(1800),
  visibleChanges: z.array(z.string().trim().min(2).max(500)).max(30),
  stableObservations: z.array(z.string().trim().min(2).max(500)).max(30),
  uncertainties: z.array(z.string().trim().min(2).max(500)).max(30),
  evidenceLimitations: z.array(z.string().trim().min(2).max(500)).max(30),
  confidence: z.number().min(0).max(1),
});

export const impactReportSchema = z.object({
  executiveSummary: z.string().trim().min(20).max(2500),
  documentedActivities: z.array(z.string().trim().min(2).max(500)).max(40),
  visibleObservations: z.array(z.string().trim().min(2).max(500)).max(40),
  comparisonFindings: z.array(z.string().trim().min(2).max(500)).max(40),
  evidenceGaps: z.array(z.string().trim().min(2).max(500)).max(40),
  methodologyNote: z.string().trim().min(20).max(1500),
});

export type AssetAnalysisResult = z.infer<typeof assetAnalysisSchema>;
export type EvidenceSearchIntent = z.infer<typeof evidenceSearchIntentSchema>;
export type ProjectInsightResult = z.infer<typeof projectInsightSchema>;
export type ComparisonAnalysisResult = z.infer<typeof comparisonAnalysisSchema>;
export type ImpactReportResult = z.infer<typeof impactReportSchema>;
