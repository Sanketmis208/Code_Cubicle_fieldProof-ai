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
  return '${local.day} ${months.at(local.month - 1)} ${local.year}';
}

String formatDayTime(DateTime time) {
  final local = time.toLocal();
  String two(int value) => value.toString().padLeft(2, '0');
  return '${formatDay(time)}, ${two(local.hour)}:${two(local.minute)}';
}
