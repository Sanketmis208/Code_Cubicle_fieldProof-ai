import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

import '../api/api_client.dart';

enum QueueStatus { pending, sending, sent, failed }

/// One capture waiting for, or done with, upload. Persisted as JSON next to its photo file.
class QueuedCapture {
  QueuedCapture({
    required this.id,
    required this.projectId,
    required this.projectName,
    required this.filePath,
    required this.manifest,
    required this.signature,
    required this.createdAt,
    required this.sizeKb,
    this.status = QueueStatus.pending,
    this.error,
    this.assetId,
    this.trustStatus,
    this.trustScore,
    this.reviewStatus,
    this.reviewNote,
    this.attempts = 0,
  });

  factory QueuedCapture.fromJson(Map<String, dynamic> json) => QueuedCapture(
        id: json['id'] as String,
        projectId: json['projectId'] as String,
        projectName: json['projectName'] as String,
        filePath: json['filePath'] as String,
        manifest: json['manifest'] as String,
        signature: json['signature'] as String,
        createdAt: DateTime.parse(json['createdAt'] as String),
        sizeKb: json['sizeKb'] as int,
        // A capture that was mid-upload when the app died is simply pending again.
        status: switch (json['status'] as String) {
          'sent' => QueueStatus.sent,
          'failed' => QueueStatus.failed,
          _ => QueueStatus.pending,
        },
        error: json['error'] as String?,
        assetId: json['assetId'] as String?,
        trustStatus: json['trustStatus'] as String?,
        trustScore: json['trustScore'] as int?,
        reviewStatus: json['reviewStatus'] as String?,
        reviewNote: json['reviewNote'] as String?,
        attempts: json['attempts'] as int? ?? 0,
      );

  final String id;
  final String projectId;
  final String projectName;
  final String filePath;

  /// The exact signed string; sent unchanged.
  final String manifest;
  final String signature;
  final DateTime createdAt;
  final int sizeKb;
  QueueStatus status;
  String? error;
  String? assetId;
  String? trustStatus;
  int? trustScore;
  String? reviewStatus;
  String? reviewNote;
  int attempts;

  Map<String, Object?> toJson() => {
        'id': id,
        'projectId': projectId,
        'projectName': projectName,
        'filePath': filePath,
        'manifest': manifest,
        'signature': signature,
        'createdAt': createdAt.toIso8601String(),
        'sizeKb': sizeKb,
        'status': status.name,
        'error': error,
        'assetId': assetId,
        'trustStatus': trustStatus,
        'trustScore': trustScore,
        'reviewStatus': reviewStatus,
        'reviewNote': reviewNote,
        'attempts': attempts,
      };
}

/// Offline-first upload queue. Captures are saved to app storage first and
/// sent when there is a connection; a failure never loses a photo. The server
/// recognises retries of the same file, so sending twice is harmless.
class CaptureQueue extends ChangeNotifier {
  CaptureQueue();

  final List<QueuedCapture> _items = [];
  Directory? _dir;
  bool _flushing = false;
  Timer? _retryTimer;

  /// Newest first.
  List<QueuedCapture> get items => List.unmodifiable(_items);
  int get waiting => _items.where((item) => item.status == QueueStatus.pending || item.status == QueueStatus.sending).length;

  /// The most recent capture still on the phone, for the "match last shot" guide.
  File? get lastPhoto {
    for (final item in _items) {
      final file = File(item.filePath);
      if (file.existsSync()) return file;
    }
    return null;
  }

  Future<Directory> _directory() async {
    final existing = _dir;
    if (existing != null) return existing;
    final base = await getApplicationDocumentsDirectory();
    final dir = Directory('${base.path}/captures');
    if (!dir.existsSync()) dir.createSync(recursive: true);
    return _dir = dir;
  }

  Future<File> _indexFile() async => File('${(await _directory()).path}/queue.json');

  Future<void> load() async {
    final index = await _indexFile();
    if (!index.existsSync()) return;
    try {
      final dir = await _directory();
      final rows = jsonDecode(await index.readAsString()) as List<dynamic>;
      _items
        ..clear()
        ..addAll(rows.map((row) {
          final json = Map<String, dynamic>.from(row as Map);
          // iOS moves the app container on every update, so paths are rebuilt
          // from the capture id rather than trusted from the saved index.
          json['filePath'] = '${dir.path}/${json['id']}.jpg';
          return QueuedCapture.fromJson(json);
        }));
      notifyListeners();
    } catch (_) {
      // A corrupt index must not block capture; photos on disk are kept.
    }
  }

  Future<void> _saving = Future<void>.value();

  /// Saves one at a time: the shutter, a flush and a status refresh can all
  /// save at once, and interleaved writes would corrupt the index.
  Future<void> _save() {
    final next = _saving.then((_) async {
      final index = await _indexFile();
      final temp = File('${index.path}.tmp');
      await temp.writeAsString(jsonEncode(_items.map((item) => item.toJson()).toList()));
      await temp.rename(index.path);
    });
    _saving = next.catchError((Object _) {});
    return next;
  }

  Future<QueuedCapture> enqueue({
    required String id,
    required String projectId,
    required String projectName,
    required List<int> bytes,
    required String manifest,
    required String signature,
  }) async {
    final file = File('${(await _directory()).path}/$id.jpg');
    await file.writeAsBytes(bytes, flush: true);
    final item = QueuedCapture(
      id: id,
      projectId: projectId,
      projectName: projectName,
      filePath: file.path,
      manifest: manifest,
      signature: signature,
      createdAt: DateTime.now(),
      sizeKb: (bytes.length / 1024).round(),
    );
    _items.insert(0, item);
    await _save();
    notifyListeners();
    return item;
  }

  /// Sends everything pending. Safe to call often; runs one pass at a time.
  Future<void> flush(ApiClient api) async {
    if (_flushing) return;
    _flushing = true;
    try {
      for (final item in _items.reversed.toList()) {
        if (item.status != QueueStatus.pending) continue;
        await _send(api, item);
      }
    } finally {
      _flushing = false;
      await _prune();
      await _save();
      notifyListeners();
      _scheduleRetry(api);
    }
  }

  Future<void> retry(ApiClient api, QueuedCapture item) async {
    item
      ..status = QueueStatus.pending
      ..error = null;
    notifyListeners();
    await flush(api);
  }

  Future<void> _send(ApiClient api, QueuedCapture item) async {
    final file = File(item.filePath);
    if (!file.existsSync()) {
      item
        ..status = QueueStatus.failed
        ..error = 'The photo file is missing on this phone';
      return;
    }
    item
      ..status = QueueStatus.sending
      ..attempts += 1;
    notifyListeners();
    try {
      final response = await api.postFile(
        '/capture/upload',
        fields: {'manifest': item.manifest, 'signature': item.signature, 'source': 'APP'},
        bytes: await file.readAsBytes(),
        filename: '${item.id}.jpg',
      );
      final assets = (response['assets'] as List<dynamic>? ?? const []).cast<Map<String, dynamic>>();
      final skipped = (response['skipped'] as List<dynamic>? ?? const []).cast<Map<String, dynamic>>();
      item
        ..status = QueueStatus.sent
        ..error = null;
      if (assets.isNotEmpty) {
        _applyAsset(item, assets.first);
      } else if (skipped.isNotEmpty) {
        // Already received on an earlier attempt whose answer was lost.
        item.assetId = skipped.first['existingAssetId'] as String?;
      }
    } on ApiException catch (error) {
      item
        ..status = error.retryable ? QueueStatus.pending : QueueStatus.failed
        ..error = error.message;
    }
  }

  void _applyAsset(QueuedCapture item, Map<String, dynamic> asset) {
    item
      ..assetId = asset['id'] as String?
      ..trustStatus = asset['trustStatus'] as String?
      ..trustScore = asset['trustScore'] as int?
      ..reviewStatus = asset['reviewStatus'] as String?
      ..reviewNote = asset['reviewNote'] as String?;
  }

  /// Pulls the latest trust and review state for sent captures (e.g. a re-shoot request).
  Future<void> refreshStatuses(ApiClient api) async {
    for (final item in _items.where((item) => item.status == QueueStatus.sent && item.assetId != null).take(30).toList()) {
      try {
        final response = await api.get('/assets/${item.assetId}');
        _applyAsset(item, response['asset'] as Map<String, dynamic>);
      } on ApiException catch (error) {
        if (error.status == 404) item.reviewStatus = 'REMOVED';
      }
    }
    await _save();
    notifyListeners();
  }

  /// Keeps the phone's storage small: sent photos beyond the newest ten are deleted.
  Future<void> _prune() async {
    var kept = 0;
    // A copy: the shutter may add captures while this loop awaits.
    for (final item in _items.toList()) {
      if (item.status != QueueStatus.sent) continue;
      kept += 1;
      if (kept > 10) {
        final file = File(item.filePath);
        if (file.existsSync()) await file.delete();
      }
    }
    // History is capped, but only sent captures are ever dropped.
    while (_items.length > 200) {
      final index = _items.lastIndexWhere((item) => item.status == QueueStatus.sent);
      if (index < 0) break;
      _items.removeAt(index);
    }
  }

  void _scheduleRetry(ApiClient api) {
    _retryTimer?.cancel();
    if (!_items.any((item) => item.status == QueueStatus.pending)) return;
    _retryTimer = Timer(const Duration(seconds: 30), () => flush(api));
  }

  /// Signing out removes this user's unsent captures and photos from the phone.
  Future<void> clear() async {
    _retryTimer?.cancel();
    final dir = await _directory();
    if (dir.existsSync()) await dir.delete(recursive: true);
    _dir = null;
    _items.clear();
    notifyListeners();
  }

  @override
  void dispose() {
    _retryTimer?.cancel();
    super.dispose();
  }
}
