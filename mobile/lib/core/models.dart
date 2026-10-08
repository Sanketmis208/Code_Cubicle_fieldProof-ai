import 'geo.dart';

class AppUser {
  const AppUser({required this.id, required this.name, required this.email});

  factory AppUser.fromJson(Map<String, dynamic> json) => AppUser(
        id: json['id'] as String,
        name: json['name'] as String,
        email: json['email'] as String,
      );

  final String id;
  final String name;
  final String email;
}

class Organization {
  const Organization({required this.id, required this.name, required this.personal});

  factory Organization.fromJson(Map<String, dynamic> json) => Organization(
        id: json['id'] as String,
        name: json['name'] as String,
        personal: json['personal'] as bool? ?? false,
      );

  final String id;
  final String name;
  final bool personal;
}

const Map<String, String> orgTypeLabels = {
  'NGO': 'NGO',
  'CSR': 'Corporate CSR',
  'GOVERNMENT': 'Government',
  'SOCIAL_ENTERPRISE': 'Social enterprise',
  'OTHER': 'Other',
};

/// Roles an owner or admin can hand out, highest first. Owners are never
/// added directly: an existing member is promoted.
const List<String> assignableRoles = ['ADMIN', 'PROGRAM_MANAGER', 'VERIFIER', 'FIELD_WORKER', 'VIEWER'];

const Map<String, String> roleHints = {
  'ADMIN': 'Members, projects, review, reports',
  'PROGRAM_MANAGER': 'Creates projects, sites and targets; assigns teams',
  'VERIFIER': 'Reviews evidence and confirms counts',
  'FIELD_WORKER': 'Captures evidence and records batches in assigned projects',
  'VIEWER': 'Reads everything, changes nothing',
};

class OrganizationDetail {
  const OrganizationDetail({required this.id, required this.name, required this.type, required this.members, required this.projects, required this.role});

  factory OrganizationDetail.fromJson(Map<String, dynamic> json) {
    final org = json['organization'] as Map<String, dynamic>;
    final count = org['_count'] as Map<String, dynamic>? ?? const {};
    return OrganizationDetail(
      id: org['id'] as String,
      name: org['name'] as String,
      type: org['type'] as String? ?? 'OTHER',
      members: (count['memberships'] as num? ?? 0).toInt(),
      projects: (count['projects'] as num? ?? 0).toInt(),
      role: json['role'] as String,
    );
  }

  final String id;
  final String name;
  final String type;
  final int members;
  final int projects;
  final String role;
}

class OrgMember {
  const OrgMember({required this.userId, required this.name, required this.email, required this.role, required this.status, required this.pendingSetup, required this.assignedProjects, required this.since});

  factory OrgMember.fromJson(Map<String, dynamic> json) {
    final user = json['user'] as Map<String, dynamic>;
    return OrgMember(
      userId: user['id'] as String,
      name: user['name'] as String,
      email: user['email'] as String? ?? '',
      role: json['role'] as String,
      status: json['status'] as String? ?? 'ACTIVE',
      pendingSetup: json['pendingSetup'] as bool? ?? false,
      assignedProjects: (json['assignedProjects'] as num? ?? 0).toInt(),
      since: json['createdAt'] == null ? null : DateTime.tryParse(json['createdAt'] as String),
    );
  }

  final String userId;
  final String name;
  final String email;
  final String role;
  final String status;
  final bool pendingSetup;
  final int assignedProjects;
  final DateTime? since;

  String get roleLabel => roleLabels[role] ?? role;
}

/// What adding a member returns: when SMTP is not configured the backend
/// hands the one-time setup link to the admin instead of emailing it.
class AddMemberResult {
  const AddMemberResult({required this.member, required this.newAccount, required this.emailSent, this.setupLink});

  factory AddMemberResult.fromJson(Map<String, dynamic> json) => AddMemberResult(
        member: OrgMember.fromJson(json['member'] as Map<String, dynamic>),
        newAccount: json['newAccount'] as bool? ?? true,
        emailSent: json['emailSent'] as bool? ?? false,
        setupLink: json['setupLink'] as String?,
      );

  final OrgMember member;
  final bool newAccount;
  final bool emailSent;
  final String? setupLink;
}

class AuditEntry {
  const AuditEntry({required this.id, required this.action, required this.entityType, required this.at, this.actorName, this.metadata});

  factory AuditEntry.fromJson(Map<String, dynamic> json) => AuditEntry(
        id: json['id'] as String,
        action: json['action'] as String,
        entityType: json['entityType'] as String? ?? '',
        at: DateTime.parse(json['createdAt'] as String),
        actorName: json['actorName'] as String?,
        metadata: json['metadata'] as Map<String, dynamic>?,
      );

  final String id;
  final String action;
  final String entityType;
  final DateTime at;
  final String? actorName;
  final Map<String, dynamic>? metadata;

  String get label => auditLabels[action] ?? action.replaceAll('.', ' ').replaceAll('_', ' ');
}

const Map<String, String> auditLabels = {
  'org.created': 'Organization created',
  'org.updated': 'Organization settings changed',
  'member.added': 'Member added by email',
  'member.left': 'Member left',
  'capture.signature_failed': 'Capture signature rejected',
  'evidence.uploaded': 'Evidence uploaded',
  'comparison.created': 'Comparison created',
  'comparison.deleted': 'Comparison deleted',
  'story.created': 'Story image created',
  'member.setup_resent': 'Setup link re-sent',
  'member.role_changed': 'Role changed',
  'member.removed': 'Member removed',
  'project.created': 'Project created',
  'project.updated': 'Project updated',
  'project.deleted': 'Project deleted',
  'project.member_added': 'Assigned to project',
  'project.member_removed': 'Removed from project',
  'site.created': 'Site added',
  'site.deleted': 'Site removed',
  'target.created': 'Target set',
  'target.deleted': 'Target removed',
  'tally.recorded': 'Batch recorded',
  'tally.reviewed': 'Batch reviewed',
  'evidence.reviewed': 'Evidence reviewed',
  'evidence.deleted': 'Evidence deleted',
  'passport.shared': 'Passport made public',
  'passport.unshared': 'Passport made private',
  'report.created': 'Report generated',
  'report.deleted': 'Report deleted',
};

class TeamMember {
  const TeamMember({required this.userId, required this.name, this.email, this.role, this.assignedAt});

  factory TeamMember.fromJson(Map<String, dynamic> json) {
    final user = json['user'] as Map<String, dynamic>;
    return TeamMember(
      userId: user['id'] as String,
      name: user['name'] as String,
      email: user['email'] as String?,
      role: json['role'] as String?,
      assignedAt: json['assignedAt'] == null ? null : DateTime.tryParse(json['assignedAt'] as String),
    );
  }

  final String userId;
  final String name;
  final String? email;
  final String? role;
  final DateTime? assignedAt;

  String get roleLabel => roleLabels[role ?? ''] ?? (role ?? 'Member');
}

class ProjectTeam {
  const ProjectTeam({required this.assigned, required this.orgWide});

  factory ProjectTeam.fromJson(Map<String, dynamic> json) => ProjectTeam(
        assigned: (json['assigned'] as List<dynamic>).map((m) => TeamMember.fromJson(m as Map<String, dynamic>)).toList(),
        orgWide: (json['orgWide'] as List<dynamic>).map((m) => TeamMember.fromJson(m as Map<String, dynamic>)).toList(),
      );

  final List<TeamMember> assigned;
  final List<TeamMember> orgWide;
}

const Map<String, String> claimVerdictLabels = {
  'SUPPORTED': 'Supported by evidence',
  'PARTIAL': 'Partly supported',
  'UNSUPPORTED': 'Not supported yet',
};

class ClaimResult {
  const ClaimResult({required this.claim, required this.verdict, required this.counts, required this.gaps, required this.evidence, this.tallied});

  factory ClaimResult.fromJson(Map<String, dynamic> json) {
    final tallied = json['tallied'] as Map<String, dynamic>?;
    return ClaimResult(
      claim: json['claim'] as String,
      verdict: json['verdict'] as String,
      counts: (json['counts'] as Map<String, dynamic>? ?? const {}).map((k, v) => MapEntry(k, (v as num).toInt())),
      gaps: (json['gaps'] as List<dynamic>? ?? const []).cast<String>(),
      evidence: (json['evidence'] as List<dynamic>? ?? const []).map((e) => Evidence.fromJson(e as Map<String, dynamic>)).toList(),
      tallied: tallied == null ? null : (label: tallied['label'] as String, confirmed: (tallied['confirmed'] as num).toInt(), recorded: (tallied['recorded'] as num).toInt()),
    );
  }

  final String claim;
  final String verdict;
  final Map<String, int> counts;
  final List<String> gaps;
  final List<Evidence> evidence;
  final ({String label, int confirmed, int recorded})? tallied;
}

const Map<String, String> reportTypeLabels = {
  'IMPACT_SUMMARY': 'Impact summary',
  'PROJECT_UPDATE': 'Project update',
  'DONOR_REPORT': 'Donor report',
  'CAMPAIGN_BRIEF': 'Campaign brief',
  'CUSTOM': 'Custom',
};

class ReportSummary {
  const ReportSummary({required this.id, required this.title, required this.reportType, required this.projectName, required this.updatedAt});

  factory ReportSummary.fromJson(Map<String, dynamic> json) => ReportSummary(
        id: json['id'] as String,
        title: json['title'] as String,
        reportType: json['reportType'] as String,
        projectName: (json['project'] as Map<String, dynamic>?)?['name'] as String? ?? '',
        updatedAt: DateTime.parse((json['updatedAt'] ?? json['createdAt']) as String),
      );

  final String id;
  final String title;
  final String reportType;
  final String projectName;
  final DateTime updatedAt;
}

/// A report sentence and the evidence and comparison ids it cites.
class ReportClaim {
  const ReportClaim({required this.text, required this.evidenceIds, required this.comparisonIds});

  factory ReportClaim.fromJson(Map<String, dynamic> json) => ReportClaim(
        text: json['text'] as String? ?? '',
        evidenceIds: (json['evidenceIds'] as List<dynamic>? ?? const []).cast<String>(),
        comparisonIds: (json['comparisonIds'] as List<dynamic>? ?? const []).cast<String>(),
      );

  final String text;
  final List<String> evidenceIds;
  final List<String> comparisonIds;

  bool get cited => evidenceIds.isNotEmpty || comparisonIds.isNotEmpty;
}

class ReportDetail {
  const ReportDetail({
    required this.summary,
    required this.executiveSummary,
    required this.activities,
    required this.observations,
    required this.comparisons,
    required this.gaps,
    required this.methodology,
    required this.evidence,
    required this.supportedClaims,
    required this.unsupportedClaims,
    required this.disclaimer,
  });

  factory ReportDetail.fromJson(Map<String, dynamic> json) {
    final body = json['content'] as Map<String, dynamic>? ?? const {};
    final citations = body['citations'] as Map<String, dynamic>? ?? const {};
    List<ReportClaim> claims(String key) => (body[key] as List<dynamic>? ?? const []).map((c) => ReportClaim.fromJson(c as Map<String, dynamic>)).toList();
    return ReportDetail(
      summary: ReportSummary.fromJson(json),
      executiveSummary: body['executiveSummary'] as String? ?? '',
      activities: claims('documentedActivities'),
      observations: claims('visibleObservations'),
      comparisons: claims('comparisonFindings'),
      gaps: (body['evidenceGaps'] as List<dynamic>? ?? const []).cast<String>(),
      methodology: body['methodologyNote'] as String? ?? '',
      evidence: (json['evidence'] as List<dynamic>? ?? const []).map((e) => Evidence.fromJson(e as Map<String, dynamic>)).toList(),
      supportedClaims: (citations['supported'] as num? ?? 0).toInt(),
      unsupportedClaims: (citations['unsupported'] as num? ?? 0).toInt(),
      disclaimer: body['disclaimer'] as String? ?? '',
    );
  }

  final ReportSummary summary;
  final String executiveSummary;
  final List<ReportClaim> activities;
  final List<ReportClaim> observations;
  final List<ReportClaim> comparisons;
  final List<String> gaps;
  final String methodology;
  final List<Evidence> evidence;
  final int supportedClaims;
  final int unsupportedClaims;
  final String disclaimer;

  /// "E3" style labels in the order the evidence was given to the model.
  String labelFor(String evidenceId) {
    final index = evidence.indexWhere((e) => e.id == evidenceId);
    return index < 0 ? '?' : 'E${index + 1}';
  }
}

class Passport {
  const Passport({required this.reviewer, required this.publicPath, required this.related, required this.delivery});

  factory Passport.fromJson(Map<String, dynamic> json) {
    final p = json['passport'] as Map<String, dynamic>;
    return Passport(
      reviewer: p['reviewer'] as String?,
      publicPath: p['publicPath'] as String?,
      related: (p['related'] as List<dynamic>? ?? const []).length,
      delivery: (p['delivery'] as List<dynamic>? ?? const [])
          .map((d) => (purpose: (d as Map<String, dynamic>)['purpose'] as String, url: d['url'] as String))
          .toList(),
    );
  }

  final String? reviewer;
  final String? publicPath;
  final int related;
  final List<({String purpose, String url})> delivery;
}

const Map<String, String> roleLabels = {
  'OWNER': 'Owner',
  'ADMIN': 'Admin',
  'PROGRAM_MANAGER': 'Program manager',
  'VERIFIER': 'Verifier',
  'FIELD_WORKER': 'Field worker',
  'VIEWER': 'Viewer',
};

class Membership {
  const Membership({required this.organization, required this.role, required this.permissions});

  factory Membership.fromJson(Map<String, dynamic> json) => Membership(
        organization: Organization.fromJson(json['organization'] as Map<String, dynamic>),
        role: json['role'] as String,
        permissions: (json['permissions'] as List<dynamic>).cast<String>(),
      );

  final Organization organization;
  final String role;
  final List<String> permissions;

  String get roleLabel => roleLabels[role] ?? role;
  bool can(String permission) => permissions.contains(permission);
}

class CaptureProject {
  const CaptureProject({required this.id, required this.name, required this.sites, this.location});

  factory CaptureProject.fromJson(Map<String, dynamic> json) => CaptureProject(
        id: json['id'] as String,
        name: json['name'] as String,
        location: json['location'] as String?,
        sites: (json['sites'] as List<dynamic>? ?? const [])
            .map((site) => Site.fromJson(site as Map<String, dynamic>))
            .toList(),
      );

  final String id;
  final String name;
  final String? location;
  final List<Site> sites;
}

/// Trust wording mirrors the web app: nothing is "fraud", only "needs a second look".
const Map<String, String> trustLabels = {
  'STRONG': 'Strong',
  'MODERATE': 'Moderate',
  'NEEDS_SECOND_LOOK': 'Needs a second look',
  'NOT_ASSESSED': 'Not assessed',
};

const Map<String, String> reviewLabels = {
  'PENDING': 'Awaiting review',
  'APPROVED': 'Approved',
  'REJECTED': 'Rejected',
  'RESHOOT_REQUESTED': 'Re-shoot requested',
};

class DashboardSummary {
  const DashboardSummary({
    required this.projects,
    required this.assets,
    required this.analyzed,
    required this.pending,
    required this.failed,
    required this.comparisons,
    required this.reports,
  });

  factory DashboardSummary.fromJson(Map<String, dynamic> json) => DashboardSummary(
        projects: (json['projects'] as num).toInt(),
        assets: (json['assets'] as num).toInt(),
        analyzed: (json['analyzed'] as num).toInt(),
        pending: (json['pending'] as num).toInt(),
        failed: (json['failed'] as num).toInt(),
        comparisons: (json['comparisons'] as num).toInt(),
        reports: (json['reports'] as num).toInt(),
      );

  final int projects;
  final int assets;
  final int analyzed;
  final int pending;
  final int failed;
  final int comparisons;
  final int reports;
}

class ProjectSummary {
  const ProjectSummary({
    required this.id,
    required this.name,
    required this.status,
    required this.assetCount,
    required this.reportCount,
    required this.comparisonCount,
    this.location,
    this.category,
    this.description,
    this.startDate,
    this.endDate,
  });

  factory ProjectSummary.fromJson(Map<String, dynamic> json) {
    final count = json['_count'] as Map<String, dynamic>? ?? const {};
    return ProjectSummary(
      id: json['id'] as String,
      name: json['name'] as String,
      status: json['status'] as String,
      location: json['location'] as String?,
      category: json['category'] as String?,
      description: json['description'] as String?,
      startDate: json['startDate'] == null ? null : DateTime.tryParse(json['startDate'] as String),
      endDate: json['endDate'] == null ? null : DateTime.tryParse(json['endDate'] as String),
      assetCount: (count['assets'] as num? ?? 0).toInt(),
      reportCount: (count['reports'] as num? ?? 0).toInt(),
      comparisonCount: (count['comparisons'] as num? ?? 0).toInt(),
    );
  }

  final String id;
  final String name;
  final String status;
  final String? location;
  final String? category;
  final String? description;
  final DateTime? startDate;
  final DateTime? endDate;
  final int assetCount;
  final int reportCount;
  final int comparisonCount;
}

class TrustCheck {
  const TrustCheck({required this.check, required this.result, required this.message, required this.hard, required this.weight});

  factory TrustCheck.fromJson(Map<String, dynamic> json) => TrustCheck(
        check: json['check'] as String,
        result: json['result'] as String,
        message: json['message'] as String,
        hard: json['hard'] as bool? ?? false,
        weight: (json['weight'] as num? ?? 0).toInt(),
      );

  final String check;
  final String result;
  final String message;
  final bool hard;
  final int weight;
}

const Map<String, String> checkLabels = {
  'SOURCE': 'Source',
  'SIGNATURE': 'Device signature',
  'MOCK_LOCATION': 'GPS authenticity',
  'EXACT_REUSE': 'Reuse',
  'NEAR_DUPLICATE': 'Possible reuse',
  'BURST': 'Burst',
  'CAPTURE_TIME': 'Capture time',
  'LOCATION': 'Location',
  'EDITING': 'Editing',
  'RECAPTURE': 'Photo of a screen',
  'SYNTHETIC': 'AI-generated',
  'STAMP': 'GPS stamp',
  'QUALITY': 'Image quality',
};

/// One piece of evidence as the list and review endpoints return it.
class Evidence {
  const Evidence({
    required this.id,
    required this.projectId,
    required this.projectName,
    required this.filename,
    required this.secureUrl,
    required this.resourceType,
    required this.createdAt,
    required this.trustStatus,
    required this.reviewStatus,
    required this.captureSource,
    required this.aiStatus,
    this.trustScore,
    this.capturedAt,
    this.activity,
    this.summary,
    this.siteName,
    this.eventClusterId,
    this.eventCount,
    this.reviewNote,
    this.uploaderName,
    this.ownUpload = false,
    this.flags = const [],
    this.checks = const [],
  });

  factory Evidence.fromJson(Map<String, dynamic> json) {
    final project = json['project'] as Map<String, dynamic>? ?? const {};
    final analysis = json['analysis'] as Map<String, dynamic>?;
    final cluster = json['eventCluster'] as Map<String, dynamic>?;
    final uploader = json['uploadedBy'] as Map<String, dynamic>?;
    List<TrustCheck> checks(String key) =>
        (json[key] as List<dynamic>? ?? const []).map((c) => TrustCheck.fromJson(c as Map<String, dynamic>)).toList();
    return Evidence(
      id: json['id'] as String,
      projectId: json['projectId'] as String,
      projectName: project['name'] as String? ?? '',
      filename: json['originalFilename'] as String,
      secureUrl: json['secureUrl'] as String,
      resourceType: json['resourceType'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      capturedAt: json['capturedAt'] == null ? null : DateTime.tryParse(json['capturedAt'] as String),
      trustStatus: json['trustStatus'] as String? ?? 'NOT_ASSESSED',
      trustScore: (json['trustScore'] as num?)?.toInt(),
      reviewStatus: json['reviewStatus'] as String? ?? 'PENDING',
      captureSource: json['captureSource'] as String? ?? 'WEB_UPLOAD',
      aiStatus: json['aiStatus'] as String? ?? 'NOT_REQUESTED',
      activity: json['activity'] as String? ?? analysis?['activity'] as String?,
      summary: analysis?['summary'] as String?,
      siteName: (json['site'] as Map<String, dynamic>?)?['name'] as String?,
      eventClusterId: json['eventClusterId'] as String?,
      eventCount: (cluster?['assetCount'] as num?)?.toInt(),
      reviewNote: json['reviewNote'] as String?,
      uploaderName: uploader?['name'] as String?,
      ownUpload: json['ownUpload'] as bool? ?? false,
      flags: checks('flags'),
      checks: checks('trustChecks'),
    );
  }

  final String id;
  final String projectId;
  final String projectName;
  final String filename;
  final String secureUrl;
  final String resourceType;
  final DateTime createdAt;
  final DateTime? capturedAt;
  final String trustStatus;
  final int? trustScore;
  final String reviewStatus;
  final String captureSource;
  final String aiStatus;
  final String? activity;
  final String? summary;
  final String? siteName;
  final String? eventClusterId;
  final int? eventCount;
  final String? reviewNote;
  final String? uploaderName;
  final bool ownUpload;
  final List<TrustCheck> flags;
  final List<TrustCheck> checks;

  bool get isVideo => resourceType == 'VIDEO';

  /// A small, browser-friendly rendition (HEIC and 25 MB originals load slowly).
  String thumbnail({int width = 600, int height = 450}) {
    if (!secureUrl.contains('/upload/')) return secureUrl;
    final transformed = secureUrl.replaceFirst('/upload/', '/upload/${isVideo ? 'so_0,f_jpg,' : 'f_auto,'}q_auto,c_fill,g_auto,w_$width,h_$height/');
    return isVideo ? transformed.replaceFirst(RegExp(r'\.[A-Za-z0-9]+$'), '.jpg') : transformed;
  }

  String get sourceLabel => switch (captureSource) {
        'APP_CAPTURE' => 'Live · app',
        'WEB_LIVE_CAPTURE' => 'Live · browser',
        _ => 'Uploaded file',
      };
}

class Target {
  const Target({
    required this.id,
    required this.label,
    required this.unit,
    required this.targetCount,
    required this.recorded,
    required this.confirmed,
    required this.withEvidence,
    required this.batches,
    required this.tallies,
  });

  factory Target.fromJson(Map<String, dynamic> json) {
    final progress = json['progress'] as Map<String, dynamic>? ?? const {};
    return Target(
      id: json['id'] as String,
      label: json['label'] as String,
      unit: json['unit'] as String,
      targetCount: (json['targetCount'] as num).toInt(),
      recorded: (progress['recorded'] as num? ?? 0).toInt(),
      confirmed: (progress['confirmed'] as num? ?? 0).toInt(),
      withEvidence: (progress['withEvidence'] as num? ?? 0).toInt(),
      batches: (progress['batches'] as num? ?? 0).toInt(),
      tallies: (json['tallies'] as List<dynamic>? ?? const []).map((t) => Tally.fromJson(t as Map<String, dynamic>)).toList(),
    );
  }

  final String id;
  final String label;
  final String unit;
  final int targetCount;
  final int recorded;
  final int confirmed;
  final int withEvidence;
  final int batches;
  final List<Tally> tallies;

  double get confirmedFraction => targetCount == 0 ? 0 : (confirmed / targetCount).clamp(0, 1).toDouble();
  double get recordedFraction => targetCount == 0 ? 0 : (recorded / targetCount).clamp(0, 1).toDouble();
}

class Tally {
  const Tally({required this.id, required this.count, required this.recordedAt, required this.reviewStatus, this.note, this.siteName, this.eventCount, this.recordedById});

  factory Tally.fromJson(Map<String, dynamic> json) => Tally(
        id: json['id'] as String,
        count: (json['count'] as num).toInt(),
        recordedAt: DateTime.parse(json['recordedAt'] as String),
        reviewStatus: json['reviewStatus'] as String? ?? 'PENDING',
        note: json['note'] as String?,
        siteName: (json['site'] as Map<String, dynamic>?)?['name'] as String?,
        eventCount: ((json['eventCluster'] as Map<String, dynamic>?)?['assetCount'] as num?)?.toInt(),
        recordedById: json['recordedById'] as String?,
      );

  final String id;
  final int count;
  final DateTime recordedAt;
  final String reviewStatus;
  final String? note;
  final String? siteName;
  final int? eventCount;
  final String? recordedById;
}

class ProjectEvent {
  const ProjectEvent({required this.id, required this.startedAt, required this.assetCount});

  factory ProjectEvent.fromJson(Map<String, dynamic> json) => ProjectEvent(
        id: json['id'] as String,
        startedAt: DateTime.parse(json['startedAt'] as String),
        assetCount: (json['assetCount'] as num).toInt(),
      );

  final String id;
  final DateTime startedAt;
  final int assetCount;
}

String formatDay(DateTime time) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  final local = time.toLocal();
  return '${local.day} ${months[local.month - 1]} ${local.year}';
}

String formatDayTime(DateTime time) {
  final local = time.toLocal();
  String two(int value) => value.toString().padLeft(2, '0');
  return '${formatDay(time)}, ${two(local.hour)}:${two(local.minute)}';
}
