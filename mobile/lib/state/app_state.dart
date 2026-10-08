import 'dart:convert';

import 'package:flutter/widgets.dart';

import '../api/api_client.dart';
import '../config.dart';
import '../core/models.dart';
import '../services/capture_queue.dart';
import '../services/device_identity.dart';
import '../services/secure_store.dart';
import '../services/trusted_clock.dart';
import '../services/workspace_api.dart';

enum SessionStatus { loading, signedOut, signedIn }

/// App-wide state: who is signed in, in which organization, the projects they
/// may capture for, and the capture queue. Screens listen through [AppScope].
class AppState extends ChangeNotifier {
  AppState({ApiClient? api, SecureStore? store})
      : api = api ?? ApiClient(baseUrl: AppConfig.apiUrl),
        store = store ?? SecureStore() {
    device = DeviceIdentity(this.store, this.api);
  }

  final ApiClient api;
  final SecureStore store;
  final TrustedClock clock = TrustedClock();
  final CaptureQueue queue = CaptureQueue();
  late final DeviceIdentity device;
  late final WorkspaceApi workspace = WorkspaceApi(api);

  SessionStatus status = SessionStatus.loading;
  AppUser? user;
  List<Membership> memberships = const [];
  Membership? membership;
  List<CaptureProject> projects = const [];
  bool canCapture = false;
  String? projectsError;
  bool loadingProjects = false;

  /// Restores the saved session (if any) and the offline queue. Never leaves
  /// the app on the loading screen: any unexpected failure means "sign in".
  Future<void> start() async {
    try {
      await _start();
    } catch (_) {
      status = SessionStatus.signedOut;
      notifyListeners();
    }
  }

  Future<void> _start() async {
    await queue.load();
    final token = await store.read('token');
    if (token == null) {
      status = SessionStatus.signedOut;
      notifyListeners();
      return;
    }
    api.token = token;
    api.organizationId = await store.read('organization');
    try {
      final me = await api.get('/auth/me');
      await _applySession(me);
    } on ApiException catch (error) {
      if (error.status == 401) {
        // Expired session: sign out but keep unsent captures for this person.
        await _endSession();
        return;
      }
      // Offline at launch: restore the last session, projects and signing
      // key from this phone, so capture works and syncs later.
      await _restoreOffline();
    }
  }

  Future<void> _restoreOffline() async {
    final session = await store.read('last_session');
    final cachedProjects = await store.read('last_projects');
    if (session != null) {
      _readSession(jsonDecode(session) as Map<String, dynamic>);
      if (user != null) await device.loadStored(user!.id);
    }
    if (cachedProjects != null) _readProjects(jsonDecode(cachedProjects) as Map<String, dynamic>);
    status = SessionStatus.signedIn;
    notifyListeners();
  }

  Future<void> signIn(String email, String password) async {
    final response = await api.post('/auth/token', {'email': email.trim().toLowerCase(), 'password': password});
    api.token = response['token'] as String;
    await store.write('token', api.token!);
    await _applySession(response);
  }

  bool can(String permission) => membership?.can(permission) ?? false;

  void _readSession(Map<String, dynamic> session) {
    user = AppUser.fromJson(session['user'] as Map<String, dynamic>);
    memberships = (session['memberships'] as List<dynamic>)
        .map((row) => Membership.fromJson(row as Map<String, dynamic>))
        .toList();
    final saved = api.organizationId;
    membership = memberships.where((m) => m.organization.id == saved).firstOrNull ?? memberships.firstOrNull;
    api.organizationId = membership?.organization.id;
  }

  void _readProjects(Map<String, dynamic> response) {
    canCapture = response['canCapture'] as bool? ?? false;
    projects = (response['projects'] as List<dynamic>)
        .map((row) => CaptureProject.fromJson(row as Map<String, dynamic>))
        .toList();
  }

  Future<void> _applySession(Map<String, dynamic> session) async {
    _readSession(session);
    await store.write('last_session', jsonEncode({'user': session['user'], 'memberships': session['memberships']}));
    // Captures queued by someone else on this phone are never sent under this account.
    final owner = await store.read('queue_owner');
    if (owner != null && owner != user!.id) await queue.clear();
    await store.write('queue_owner', user!.id);
    if (api.organizationId != null) await store.write('organization', api.organizationId!);
    status = SessionStatus.signedIn;
    notifyListeners();
    await _connect();
  }

  /// Everything that needs the network after sign-in; failures are tolerated (offline).
  Future<void> _connect() async {
    try {
      await clock.sync(api);
    } on ApiException {
      // Captures fall back to the device clock, labelled DEVICE.
    }
    try {
      if (user != null) await device.ensureEnrolled(user!.id);
    } on ApiException {
      // Enrolment retried on the next refresh.
    }
    await refreshProjects();
    await queue.flush(api);
  }

  /// Pull-to-refresh; after an offline start it also re-reads the session.
  Future<void> refresh() async {
    if (api.token != null) {
      try {
        await _applySession(await api.get('/auth/me'));
        return;
      } on ApiException catch (error) {
        if (error.status == 401) return _endSession();
      }
    }
    await _connect();
  }

  Future<void> refreshProjects() async {
    if (membership == null) return;
    loadingProjects = true;
    projectsError = null;
    notifyListeners();
    try {
      final response = await api.get('/capture/projects');
      _readProjects(response);
      await store.write('last_projects', jsonEncode(response));
    } on ApiException catch (error) {
      projectsError = error.message;
    } finally {
      loadingProjects = false;
      notifyListeners();
    }
  }

  Future<void> switchOrganization(Membership next) async {
    membership = next;
    api.organizationId = next.organization.id;
    await store.write('organization', next.organization.id);
    projects = const [];
    notifyListeners();
    await refreshProjects();
  }

  /// Deliberate sign-out: unsent captures belong to this person, so they do
  /// not stay behind on a shared phone.
  Future<void> signOut() async {
    await queue.clear();
    await store.delete('queue_owner');
    await _endSession();
  }

  Future<void> _endSession() async {
    await store.delete('token');
    await store.delete('last_session');
    await store.delete('last_projects');
    await store.delete('organization');
    api
      ..token = null
      ..organizationId = null;
    device.forget();
    user = null;
    memberships = const [];
    membership = null;
    projects = const [];
    status = SessionStatus.signedOut;
    notifyListeners();
  }
}

/// Makes [AppState] available to every screen and rebuilds them on change.
class AppScope extends InheritedNotifier<AppState> {
  const AppScope({super.key, required AppState state, required super.child}) : super(notifier: state);

  static AppState of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AppScope>();
    assert(scope != null, 'AppScope missing above this widget');
    return scope!.notifier!;
  }
}
