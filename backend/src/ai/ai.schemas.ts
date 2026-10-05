import { z } from "zod";

const signalSchema = z.object({
  type: z.string().trim().min(1).max(100),
  description: z.string().trim().min(2).max(500),
  confidence: z.number().min(0).max(1),
});

const likelihood = z.enum(["low", "medium", "high"]);

/**
 * Trust signals read in the same vision call as the description, so they cost
 * no extra AI quota. `.catch` keeps a malformed block from failing the whole
 * analysis: the description still lands and these checks simply do not run.
 */
export const authenticitySchema = z
  .object({
    recaptureLikelihood: likelihood,
    syntheticLikelihood: likelihood,
    burnedInStamp: z.object({
      present: z.boolean(),
      text: z.string().trim().max(300).nullable(),
      latitude: z.number().min(-90).max(90).nullable(),
      longitude: z.number().min(-180).max(180).nullable(),
      capturedAt: z.string().trim().max(40).nullable(),
    }),
    notes: z.array(z.string().trim().max(300)).max(5).default([]),
  })
  .optional()
  .catch(undefined);

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
  authenticity: authenticitySchema,
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
  /** Whether both images show the same spot from a similar position; feeds the Comparability Score. */
  viewpointMatch: z.enum(["same", "similar", "different"]).optional().catch(undefined),
  summary: z.string().trim().min(20).max(1800),
  visibleChanges: z.array(z.string().trim().min(2).max(500)).max(30),
  stableObservations: z.array(z.string().trim().min(2).max(500)).max(30),
  uncertainties: z.array(z.string().trim().min(2).max(500)).max(30),
  evidenceLimitations: z.array(z.string().trim().min(2).max(500)).max(30),
  confidence: z.number().min(0).max(1),
});

/** A report sentence and the evidence labels (E1, E2, C1 …) it rests on. */
const claim = z.object({
  text: z.string().trim().min(2).max(500),
  evidence: z.array(z.string().trim().max(12)).max(12).default([]),
});

export const impactReportSchema = z.object({
  executiveSummary: z.string().trim().min(20).max(2500),
  documentedActivities: z.array(claim).max(30),
  visibleObservations: z.array(claim).max(30),
  comparisonFindings: z.array(claim).max(30),
  evidenceGaps: z.array(z.string().trim().min(2).max(500)).max(30),
  methodologyNote: z.string().trim().min(20).max(1500),
});

export const claimIntentSchema = z.object({
  activities: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
  locationTerms: z.array(z.string().trim().min(1).max(120)).max(10).default([]),
  dateFrom: z.string().date().nullable().default(null),
  dateTo: z.string().date().nullable().default(null),
  quantity: z.object({ value: z.number(), unit: z.string().trim().max(60) }).nullable().default(null),
  keywords: z.array(z.string().trim().min(1).max(60)).max(15).default([]),
});

export type AssetAnalysisResult = z.infer<typeof assetAnalysisSchema>;
export type EvidenceSearchIntent = z.infer<typeof evidenceSearchIntentSchema>;
export type ProjectInsightResult = z.infer<typeof projectInsightSchema>;
export type ComparisonAnalysisResult = z.infer<typeof comparisonAnalysisSchema>;
export type ImpactReportResult = z.infer<typeof impactReportSchema>;
export type ClaimIntent = z.infer<typeof claimIntentSchema>;
