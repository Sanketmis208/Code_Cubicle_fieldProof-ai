import '../api/api_client.dart';
import '../core/geo.dart';
import '../core/models.dart';

/// Typed access to the workspace endpoints the app reads and writes. Every
/// call carries the bearer token and the active organization.
class WorkspaceApi {
  WorkspaceApi(this._api);

  final ApiClient _api;

  Future<DashboardSummary> dashboard() async => DashboardSummary.fromJson(await _api.get('/dashboard/summary'));

  Future<List<ProjectSummary>> projects() async {
    final response = await _api.get('/projects');
    return (response['projects'] as List<dynamic>).map((p) => ProjectSummary.fromJson(p as Map<String, dynamic>)).toList();
  }

  Future<List<Evidence>> evidence({String? projectId, String? reviewStatus, int limit = 48}) async {
    final query = <String, String>{'limit': '$limit', 'sort': 'newest', if (projectId != null) 'projectId': projectId, if (reviewStatus != null) 'reviewStatus': reviewStatus};
    final response = await _api.get('/assets?${Uri(queryParameters: query).query}');
    return (response['assets'] as List<dynamic>).map((a) => Evidence.fromJson(a as Map<String, dynamic>)).toList();
  }

  Future<Evidence> evidenceDetail(String id) async => Evidence.fromJson((await _api.get('/assets/$id'))['asset'] as Map<String, dynamic>);

  Future<void> analyze(String id) => _api.post('/assets/$id/analyze', {});

  Future<List<Site>> sites(String projectId) async {
    final response = await _api.get('/projects/$projectId/sites');
    return (response['sites'] as List<dynamic>).map((s) => Site.fromJson(s as Map<String, dynamic>)).toList();
  }

  Future<List<Target>> targets(String projectId) async {
    final response = await _api.get('/projects/$projectId/targets');
    return (response['targets'] as List<dynamic>).map((t) => Target.fromJson(t as Map<String, dynamic>)).toList();
  }

  Future<List<ProjectEvent>> events(String projectId) async {
    final response = await _api.get('/projects/$projectId/events');
    return (response['events'] as List<dynamic>).map((e) => ProjectEvent.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> recordTally(String targetId, {required int count, String? siteId, String? eventClusterId, String? note}) =>
      _api.post('/targets/$targetId/tallies', {
        'count': count,
        if (siteId != null) 'siteId': siteId,
        if (eventClusterId != null) 'eventClusterId': eventClusterId,
        if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
      });

  Future<void> reviewTally(String tallyId, String decision) => _api.post('/targets/tallies/$tallyId/review', {'decision': decision});

  Future<({List<Evidence> items, Map<String, int> counts, bool selfReviewAllowed})> reviewQueue({String? projectId, String status = 'PENDING'}) async {
    final query = <String, String>{'status': status, if (projectId != null) 'projectId': projectId};
    final response = await _api.get('/review/queue?${Uri(queryParameters: query).query}');
    final counts = (response['counts'] as Map<String, dynamic>? ?? const {}).map((k, v) => MapEntry(k, (v as num).toInt()));
    return (
      items: (response['assets'] as List<dynamic>).map((a) => Evidence.fromJson(a as Map<String, dynamic>)).toList(),
      counts: counts,
      selfReviewAllowed: response['selfReviewAllowed'] as bool? ?? false,
    );
  }

  Future<void> review(String assetId, String decision, {String? note}) =>
      _api.post('/review/assets/$assetId', {'decision': decision, if (note != null) 'note': note});

  Future<({int reviewed, int left})> reviewEvent(String clusterId) async {
    final response = await _api.post('/review/events/$clusterId', {'decision': 'APPROVED'});
    return (reviewed: (response['reviewed'] as num).toInt(), left: (response['left'] as List<dynamic>).length);
  }

  Future<String> ask(List<({String role, String content})> messages) async {
    final response = await _api.post('/assistant/chat', {
      'messages': messages.map((m) => {'role': m.role, 'content': m.content}).toList(),
    });
    return response['reply'] as String;
  }

  Future<void> forgotPassword(String email) => _api.post('/auth/forgot-password', {'email': email.trim().toLowerCase()});

  // ---- Organization -------------------------------------------------------

  Future<OrganizationDetail> organization(String orgId) async => OrganizationDetail.fromJson(await _api.get('/orgs/$orgId'));

  Future<Map<String, dynamic>> createOrganization({required String name, required String type}) =>
      _api.post('/orgs', {'name': name.trim(), 'type': type});

  Future<void> updateOrganization(String orgId, {String? name, String? type}) =>
      _api.patch('/orgs/$orgId', {if (name != null) 'name': name.trim(), if (type != null) 'type': type});

  Future<List<OrgMember>> members(String orgId) async {
    final response = await _api.get('/orgs/$orgId/members');
    return (response['members'] as List<dynamic>).map((m) => OrgMember.fromJson(m as Map<String, dynamic>)).toList();
  }

  Future<AddMemberResult> addMember(String orgId, {required String name, required String email, required String role}) async =>
      AddMemberResult.fromJson(await _api.post('/orgs/$orgId/members', {'name': name.trim(), 'email': email.trim().toLowerCase(), 'role': role}));

  Future<({bool emailSent, String? setupLink})> resendSetup(String orgId, String userId) async {
    final response = await _api.post('/orgs/$orgId/members/$userId/resend-setup');
    return (emailSent: response['emailSent'] as bool? ?? false, setupLink: response['setupLink'] as String?);
  }

  Future<void> changeRole(String orgId, String userId, String role) => _api.patch('/orgs/$orgId/members/$userId', {'role': role});

  Future<void> removeMember(String orgId, String userId) => _api.delete('/orgs/$orgId/members/$userId');

  Future<({List<AuditEntry> entries, bool intact})> audit(String orgId) async {
    final response = await _api.get('/orgs/$orgId/audit');
    final integrity = response['integrity'];
    final intact = integrity is Map<String, dynamic> ? (integrity['valid'] as bool? ?? true) : true;
    return (entries: (response['entries'] as List<dynamic>).map((e) => AuditEntry.fromJson(e as Map<String, dynamic>)).toList(), intact: intact);
  }

  // ---- Projects -----------------------------------------------------------

  Future<ProjectSummary> project(String id) async => ProjectSummary.fromJson((await _api.get('/projects/$id'))['project'] as Map<String, dynamic>);

  Future<ProjectSummary> createProject(Map<String, Object?> fields) async =>
      ProjectSummary.fromJson((await _api.post('/projects', fields))['project'] as Map<String, dynamic>);

  Future<ProjectSummary> updateProject(String id, Map<String, Object?> fields) async =>
      ProjectSummary.fromJson((await _api.patch('/projects/$id', fields))['project'] as Map<String, dynamic>);

  Future<void> deleteProject(String id) => _api.delete('/projects/$id');

  Future<ProjectTeam> team(String projectId) async => ProjectTeam.fromJson(await _api.get('/projects/$projectId/members'));

  Future<void> assign(String projectId, String userId) => _api.post('/projects/$projectId/members', {'userId': userId});

  Future<void> unassign(String projectId, String userId) => _api.delete('/projects/$projectId/members/$userId');

  Future<void> createSite(String projectId, {required String name, required double latitude, required double longitude, required int radiusM}) =>
      _api.post('/projects/$projectId/sites', {'name': name.trim(), 'latitude': latitude, 'longitude': longitude, 'radiusM': radiusM});

  Future<void> deleteSite(String projectId, String siteId) => _api.delete('/projects/$projectId/sites/$siteId');

  Future<void> createTarget(String projectId, {required String label, required String unit, required int targetCount, DateTime? dueDate}) =>
      _api.post('/projects/$projectId/targets', {
        'label': label.trim(),
        'unit': unit.trim(),
        'targetCount': targetCount,
        if (dueDate != null) 'dueDate': dueDate.toUtc().toIso8601String(),
      });

  Future<void> deleteTarget(String projectId, String targetId) => _api.delete('/projects/$projectId/targets/$targetId');

  // ---- Proof --------------------------------------------------------------

  Future<ClaimResult> checkClaim(String claim, {String? projectId}) async =>
      ClaimResult.fromJson(await _api.post('/claims/check', {'claim': claim.trim(), if (projectId != null) 'projectId': projectId}));

  Future<List<ReportSummary>> reports({String? projectId}) async {
    final response = await _api.get(projectId == null ? '/reports' : '/reports?projectId=$projectId');
    return (response['reports'] as List<dynamic>).map((r) => ReportSummary.fromJson(r as Map<String, dynamic>)).toList();
  }

  Future<ReportSummary> createReport({required String projectId, required String title, required String reportType}) async =>
      ReportSummary.fromJson((await _api.post('/reports', {'projectId': projectId, 'title': title.trim(), 'reportType': reportType}))['report'] as Map<String, dynamic>);

  Future<ReportDetail> report(String id) async => ReportDetail.fromJson((await _api.get('/reports/$id'))['report'] as Map<String, dynamic>);

  Future<void> deleteReport(String id) => _api.delete('/reports/$id');

  Future<Passport> passport(String assetId) async => Passport.fromJson(await _api.get('/assets/$assetId/passport'));

  Future<String> sharePassport(String assetId) async => (await _api.post('/assets/$assetId/share'))['publicPath'] as String;

  Future<void> unsharePassport(String assetId) => _api.delete('/assets/$assetId/share');
}
