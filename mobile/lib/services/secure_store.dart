import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Session token, active organization and the per-user device key live in the
/// platform's protected storage (Android Keystore-backed, iOS Keychain).
class SecureStore {
  SecureStore([FlutterSecureStorage? storage])
      : _storage = storage ?? const FlutterSecureStorage(aOptions: AndroidOptions(encryptedSharedPreferences: true));

  final FlutterSecureStorage _storage;

  Future<String?> read(String key) => _storage.read(key: key);
  Future<void> write(String key, String value) => _storage.write(key: key, value: value);
  Future<void> delete(String key) => _storage.delete(key: key);
}
