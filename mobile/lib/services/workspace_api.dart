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
}
