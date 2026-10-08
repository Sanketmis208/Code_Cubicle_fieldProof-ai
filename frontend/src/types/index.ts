export type User = { id: string; name: string; email: string; organizationName?: string | null; role?: string | null; createdAt: string };
export type ProjectStatus = 'PLANNING' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
export type Project = {
  id: string; name: string; description?: string | null; location?: string | null; category?: string | null;
  status: ProjectStatus; startDate: string; endDate?: string | null; coverImage?: string | null; createdAt: string; updatedAt: string;
  _count: { assets: number; comparisons: number; reports: number };
  recentAssets?: Asset[];
  workspaceMetrics?: {
    statusGroups: Array<{ aiStatus: AnalysisStatus; _count: number }>;
    typeGroups: Array<{ resourceType: Asset['resourceType']; _count: number }>;
    coverage: {
      totalMedia: number; analyzedPercent: number; locationsRepresented: number;
      datesRepresented: number; activityCategories: string[];
      beforeAfterCandidates: number; qualityFlags: number;
    };
  };
  insight?: ProjectInsight | null;
  recentComparisons?: Comparison[];
  recentReports?: Report[];
};
export type ProjectInput = Omit<Project, 'id' | 'createdAt' | 'updatedAt' | '_count'>;

export type AnalysisStatus = 'NOT_REQUESTED' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type AssetAnalysis = {
  id: string; summary: string; detailedDescription?: string | null; activity: string;
  projectCategoryHints?: string[] | null; locationType?: string | null;
  visibleSubjects?: string[] | null;
  environmentalSignals: Array<{ type: string; description: string; confidence: number }>;
  infrastructureSignals?: Array<{ type: string; description: string; confidence: number }> | null;
  detectedObjects: string[]; tags: string[]; visualQuality?: string | null;
  evidenceStrength?: 'strong' | 'moderate' | 'limited' | null;
  evidenceUsefulness?: string | null; uncertainties?: string[] | null;
  representativeFrames?: string[] | null; confidence?: number | null;
  analysisVersion?: number; model?: string | null; createdAt: string;
};
export type Asset = {
  id: string; projectId: string; cloudinaryPublicId: string; cloudinaryAssetId?: string | null;
  resourceType: 'IMAGE' | 'VIDEO' | 'RAW'; secureUrl: string; originalFilename: string;
  width?: number | null; height?: number | null; bytes?: number | null; format?: string | null;
  capturedAt?: string | null; latitude?: number | null; longitude?: number | null; locationName?: string | null;
  activity?: string | null; description?: string | null; aiStatus: AnalysisStatus;
  analysisError?: string | null; analysisAttempts?: number; lastAnalyzedAt?: string | null;
  createdAt: string; updatedAt: string;
  favorite: boolean;
  project: { id: string; name: string; location?: string | null; category?: string | null }; analysis?: AssetAnalysis | null;
  // Trust layer (absent on very old API responses).
  captureSource?: CaptureSource; sha256?: string | null; phash?: string | null;
  exif?: ExifSummary | null; cloudinaryAnalysis?: CloudinaryAnalysis | null;
  qualityScore?: number | null; faceCount?: number | null;
  capturedAtSource?: 'EXIF' | 'STAMP' | 'DEVICE' | 'SERVER' | null; locationSource?: 'EXIF' | 'STAMP' | 'DEVICE' | null;
  gpsAccuracyM?: number | null; capturedByName?: string | null;
  trustScore?: number | null; trustStatus?: TrustStatus; trustEvaluatedAt?: string | null;
  reviewStatus?: ReviewStatus; reviewedById?: string | null; reviewedAt?: string | null; reviewNote?: string | null;
  publicToken?: string | null; siteId?: string | null; eventClusterId?: string | null;
  eventCluster?: { id: string; assetCount: number; representativeIds: string[]; startedAt: string; endedAt: string } | null;
  site?: { id: string; name: string } | null;
  trustChecks?: TrustCheck[];
  uploadedById?: string | null;
};
export type CaptureSource = 'WEB_UPLOAD' | 'WEB_LIVE_CAPTURE' | 'APP_CAPTURE';
export type TrustStatus = 'NOT_ASSESSED' | 'STRONG' | 'MODERATE' | 'NEEDS_SECOND_LOOK';
export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'RESHOOT_REQUESTED';
export type ExifSummary = {
  make?: string; model?: string; software?: string; capturedAt?: string; capturedAtRaw?: string; offset?: string;
  offsetAssumed?: boolean; latitude?: number; longitude?: number; altitude?: number;
};
export type CloudinaryAnalysis = {
  requested?: string[]; phash?: string | null; quality_analysis?: { focus?: number } | null; faces?: number[][] | null;
  device?: { signatureValid?: boolean | null; mockLocation?: boolean | null; platform?: string | null } | null;
};
export type TrustCheck = {
  id: string; check: string; result: 'PASS' | 'INFO' | 'WARN' | 'FAIL'; weight: number; hard: boolean;
  message: string; details?: Record<string, unknown> | null; relatedAssetId?: string | null;
};
export type Site = { id: string; projectId: string; name: string; latitude: number; longitude: number; radiusM: number; _count?: { assets: number } };
export type DerivedAsset = { id: string; projectId?: string | null; sourceAssetIds: string[]; kind: string; transformation: string; url: string; createdAt: string };
export type DeliveryUrl = { purpose: string; transformation: string; url: string };
export type Passport = {
  asset: Asset & { uploadedBy?: { id: string; name: string } | null; trustChecks: TrustCheck[]; project: Asset['project'] & { organization?: { name: string } } };
  reviewer: string | null;
  derived: DerivedAsset[];
  related: Array<Pick<Asset, 'id' | 'secureUrl' | 'resourceType' | 'cloudinaryPublicId' | 'originalFilename' | 'createdAt' | 'capturedAt'> & { project: { name: string } }>;
  delivery: DeliveryUrl[];
  publicPath: string | null;
};
export type PublicPassport = {
  organization: string; project: string; resourceType: Asset['resourceType']; previewUrl: string | null; sha256?: string | null;
  captureSource: CaptureSource; capturedAt?: string | null; capturedAtSource?: string | null; uploadedAt: string;
  approximateLocation: { latitude: number | null; longitude: number | null } | null; locationSource?: string | null; site: string | null;
  trustScore?: number | null; trustStatus: TrustStatus;
  checks: Array<Pick<TrustCheck, 'check' | 'result' | 'message' | 'hard'>>;
  review: { status: ReviewStatus; reviewedAt?: string | null };
  observation: { summary: string; activity: string } | null;
  derived: Array<Pick<DerivedAsset, 'kind' | 'transformation' | 'url' | 'createdAt'>>;
  delivery: DeliveryUrl[];
};
export type ReviewItem = Asset & { flags: TrustCheck[]; ownUpload: boolean; uploadedBy?: { id: string; name: string } | null };
export type ClaimVerdict = 'SUPPORTED' | 'PARTIAL' | 'UNSUPPORTED';
export type ClaimResult = {
  claim: string; verdict: ClaimVerdict;
  intent: { activities: string[]; locationTerms: string[]; dateFrom: string | null; dateTo: string | null; quantity: { value: number; unit: string } | null; keywords: string[] };
  counts: { matching: number; events: number; approved: number; trusted: number; needsSecondLook: number; insideSite: number };
  gaps: string[]; evidence: Asset[];
  tallied?: { confirmed: number; recorded: number; label: string } | null;
};
export type StoryKind = 'SQUARE_CARD' | 'STORY' | 'BEFORE_AFTER';
export type EvidenceSearchIntent = {
  queryText: string; projectIds: string[]; activities: string[]; tags: string[];
  signals: string[]; dateFrom: string | null; dateTo: string | null;
  mediaTypes: Array<Asset['resourceType']>; locationTerms: string[]; freeTextTerms: string[];
};
export type ProjectInsight = {
  id: string; summary: string; documentedActivities: string[]; locationsRepresented: string[];
  timeSpan: string; recurringObservations: string[]; evidenceGaps: string[];
  recentActivity: string; uncertaintyNotes: string[]; sourceEvidenceCount: number;
  model?: string | null; createdAt: string; updatedAt: string;
};
export type ComparisonChanges = {
  visibleChanges: string[]; stableObservations: string[]; uncertainties: string[];
  evidenceLimitations: string[]; model?: string;
  comparability?: { score: number; indicativeOnly: boolean; factors: Array<{ factor: string; impact: number; note: string }> };
};
export type ComparisonAsset = Pick<Asset, 'id'|'projectId'|'originalFilename'|'resourceType'|'secureUrl'|'cloudinaryPublicId'|'capturedAt'|'createdAt'|'locationName'|'activity'|'description'|'analysis'>;
export type Comparison = {
  id: string; projectId: string; beforeAssetId: string; afterAssetId: string;
  summary?: string | null; changes?: ComparisonChanges | null; confidence?: number | null;
  createdAt: string; project: { id: string; name: string };
  beforeAsset: ComparisonAsset; afterAsset: ComparisonAsset;
};
export type ReportType = 'IMPACT_SUMMARY'|'PROJECT_UPDATE'|'DONOR_REPORT'|'CAMPAIGN_BRIEF'|'CUSTOM';
/** Reports from before citations store plain strings; newer ones store cited claims. */
export type ReportClaim = string | { text: string; evidenceIds: string[]; comparisonIds?: string[] };
export type ReportContent = {
  executiveSummary: string; documentedActivities: ReportClaim[]; visibleObservations: ReportClaim[];
  comparisonFindings: ReportClaim[]; evidenceGaps: string[]; methodologyNote: string;
  evidenceIds: string[]; comparisonIds: string[]; generatedAt: string;
  model?: string; disclaimer: string;
  citations?: { supported: number; unsupported: number };
  selection?: { totalEvidence: number; considered: number; approved: number; excludedRejected: number; excludedNeedsSecondLook: number };
};
export type Report = {
  id: string; projectId: string; title: string; reportType: ReportType;
  content: ReportContent; createdAt: string; updatedAt: string;
  project: { id: string; name: string }; evidence?: Asset[];
};

export type OrgRole = 'OWNER' | 'ADMIN' | 'PROGRAM_MANAGER' | 'VERIFIER' | 'FIELD_WORKER' | 'VIEWER';
export type OrgType = 'NGO' | 'CSR' | 'GOVERNMENT' | 'SOCIAL_ENTERPRISE' | 'OTHER';
export type Permission =
  | 'org.settings' | 'org.members.view' | 'org.members.manage' | 'audit.view'
  | 'project.create' | 'project.edit' | 'project.delete' | 'project.members.manage'
  | 'evidence.upload' | 'evidence.analyze' | 'evidence.curate' | 'evidence.delete' | 'evidence.review'
  | 'insight.generate' | 'comparison.create' | 'comparison.delete' | 'report.create' | 'report.delete' | 'story.create';
export type Organization = {
  id: string; name: string; slug: string; type: OrgType; logoUrl?: string | null; personal: boolean; createdAt: string;
};
export type Membership = { organization: Organization; role: OrgRole; permissions: Permission[]; allProjects: boolean };
export type Session = { user: User; memberships: Membership[] };
export type OrgMember = {
  role: OrgRole; status: 'ACTIVE' | 'SUSPENDED'; createdAt: string; assignedProjects: number;
  /** True until the person has opened their setup link and chosen a password. */
  pendingSetup: boolean;
  user: { id: string; name: string; email: string };
};
export type AddMemberResult = { member: OrgMember; newAccount: boolean; emailSent: boolean; setupLink: string | null };
export type SetupPreview = { name: string; email: string; organization: string | null; role: OrgRole | null };
export type Target = {
  id: string; projectId: string; label: string; unit: string; targetCount: number; dueDate?: string | null; createdAt: string;
  tallies: Tally[];
  progress: { recorded: number; confirmed: number; withEvidence: number; recordedPercent: number; confirmedPercent: number; batches: number };
};
export type Tally = {
  id: string; targetId: string; count: number; recordedAt: string; note?: string | null; recordedById?: string | null;
  reviewStatus: ReviewStatus; reviewedAt?: string | null;
  site?: { id: string; name: string } | null;
  eventCluster?: { id: string; assetCount: number; representativeIds: string[]; startedAt: string } | null;
};
export type AuditEntry = {
  id: string; seq: number; actorId?: string | null; actorName?: string | null; action: string; entityType: string;
  entityId?: string | null; metadata?: Record<string, unknown> | null; hash: string; createdAt: string;
};
export type ProjectTeam = {
  assigned: Array<{ user: { id: string; name: string; email?: string }; role: OrgRole | null; assignedAt: string }>;
  orgWide: Array<{ user: { id: string; name: string; email?: string }; role: OrgRole }>;
};
