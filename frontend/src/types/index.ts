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
};
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
};
export type ComparisonAsset = Pick<Asset, 'id'|'projectId'|'originalFilename'|'resourceType'|'secureUrl'|'cloudinaryPublicId'|'capturedAt'|'createdAt'|'locationName'|'activity'|'description'|'analysis'>;
export type Comparison = {
  id: string; projectId: string; beforeAssetId: string; afterAssetId: string;
  summary?: string | null; changes?: ComparisonChanges | null; confidence?: number | null;
  createdAt: string; project: { id: string; name: string };
  beforeAsset: ComparisonAsset; afterAsset: ComparisonAsset;
};
export type ReportType = 'IMPACT_SUMMARY'|'PROJECT_UPDATE'|'DONOR_REPORT'|'CAMPAIGN_BRIEF'|'CUSTOM';
export type ReportContent = {
  executiveSummary: string; documentedActivities: string[]; visibleObservations: string[];
  comparisonFindings: string[]; evidenceGaps: string[]; methodologyNote: string;
  evidenceIds: string[]; comparisonIds: string[]; generatedAt: string;
  model?: string; disclaimer: string;
};
export type Report = {
  id: string; projectId: string; title: string; reportType: ReportType;
  content: ReportContent; createdAt: string; updatedAt: string;
  project: { id: string; name: string }; evidence?: Asset[];
};

export type OrgRole = 'OWNER' | 'ADMIN' | 'PROGRAM_MANAGER' | 'VERIFIER' | 'FIELD_WORKER' | 'VIEWER';
export type OrgType = 'NGO' | 'CSR' | 'GOVERNMENT' | 'SOCIAL_ENTERPRISE' | 'OTHER';
export type Permission =
  | 'org.settings' | 'org.members.view' | 'org.members.manage' | 'org.invites.manage' | 'audit.view'
  | 'project.create' | 'project.edit' | 'project.delete' | 'project.members.manage'
  | 'evidence.upload' | 'evidence.analyze' | 'evidence.curate' | 'evidence.delete' | 'evidence.review'
  | 'insight.generate' | 'comparison.create' | 'comparison.delete' | 'report.create' | 'report.delete';
export type Organization = {
  id: string; name: string; slug: string; type: OrgType; logoUrl?: string | null; personal: boolean; createdAt: string;
};
export type Membership = { organization: Organization; role: OrgRole; permissions: Permission[]; allProjects: boolean };
export type Session = { user: User; memberships: Membership[] };
export type OrgMember = {
  role: OrgRole; status: 'ACTIVE' | 'SUSPENDED'; createdAt: string; assignedProjects: number;
  user: { id: string; name: string; email: string };
};
export type InviteStatus = 'ACTIVE' | 'USED' | 'EXPIRED' | 'REVOKED';
export type Invite = {
  id: string; codeHint: string; role: OrgRole; email?: string | null; expiresAt: string; maxUses: number;
  usedCount: number; revokedAt?: string | null; createdAt: string; status: InviteStatus;
};
export type AuditEntry = {
  id: string; seq: number; actorId?: string | null; actorName?: string | null; action: string; entityType: string;
  entityId?: string | null; metadata?: Record<string, unknown> | null; hash: string; createdAt: string;
};
export type ProjectTeam = {
  assigned: Array<{ user: { id: string; name: string; email?: string }; role: OrgRole | null; assignedAt: string }>;
  orgWide: Array<{ user: { id: string; name: string; email?: string }; role: OrgRole }>;
};
