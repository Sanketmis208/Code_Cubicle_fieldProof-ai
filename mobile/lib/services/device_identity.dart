import 'dart:convert';
import 'dart:io';

import 'package:cryptography/cryptography.dart';

import '../api/api_client.dart';
import '../config.dart';
import 'secure_store.dart';

/// The phone's signing identity for one user. An Ed25519 key pair is created
/// once, its public half enrolled with the server, and every capture manifest
/// is signed with it, so any change to the file or its facts after the
/// shutter is detected. The private key never leaves this device.
///
/// Limitation, stated honestly: the key is stored in platform-protected
/// storage, not generated inside secure hardware, and device integrity
/// (Play Integrity / App Attest) is not yet checked. Both are on the roadmap.
class DeviceIdentity {
  DeviceIdentity(this._store, this._api);

  final SecureStore _store;
  final ApiClient _api;
  final Ed25519 _algorithm = Ed25519();
  SimpleKeyPair? _keyPair;
  String? deviceId;

  String _seedKey(String userId) => 'device_seed_$userId';
  String _idKey(String userId) => 'device_id_$userId';

  bool get ready => _keyPair != null && deviceId != null;

  Future<void>? _enrolling;

  /// Loads this user's key, or creates and enrols one. Needs a connection only
  /// the first time. Concurrent calls share one attempt, so a key and a device
  /// id from two different enrolments can never be mixed.
  Future<void> ensureEnrolled(String userId) =>
      _enrolling ??= _ensureEnrolled(userId).whenComplete(() => _enrolling = null);

  /// Offline start: use the key enrolled earlier without asking the server.
  Future<bool> loadStored(String userId) async {
    final seed = await _store.read(_seedKey(userId));
    final id = await _store.read(_idKey(userId));
    if (seed == null || id == null) return false;
    _keyPair = await _algorithm.newKeyPairFromSeed(base64Decode(seed));
    deviceId = id;
    return true;
  }

  Future<void> _ensureEnrolled(String userId) async {
    final storedSeed = await _store.read(_seedKey(userId));
    final storedId = await _store.read(_idKey(userId));
    if (storedSeed != null) {
      _keyPair = await _algorithm.newKeyPairFromSeed(base64Decode(storedSeed));
      if (storedId != null) {
        deviceId = storedId;
        return;
      }
    }
    final keyPair = _keyPair ?? await _algorithm.newKeyPair();
    final seed = await keyPair.extractPrivateKeyBytes();
    final publicKey = await keyPair.extractPublicKey();
    final response = await _api.post('/capture/devices', {
      'publicKey': base64Encode(publicKey.bytes),
      'platform': Platform.isIOS ? 'ios' : 'android',
      'appVersion': AppConfig.appVersion,
    });
    final device = response['device'] as Map<String, dynamic>;
    _keyPair = keyPair;
    deviceId = device['id'] as String;
    await _store.write(_seedKey(userId), base64Encode(seed));
    await _store.write(_idKey(userId), deviceId!);
  }

  /// Base64 Ed25519 signature over [message] (the UTF-8 manifest string).
  Future<String> sign(List<int> message) async {
    final keyPair = _keyPair;
    if (keyPair == null) throw StateError('Device is not enrolled');
    final signature = await _algorithm.sign(message, keyPair: keyPair);
    return base64Encode(signature.bytes);
  }

  void forget() {
    _keyPair = null;
    deviceId = null;
  }
}
