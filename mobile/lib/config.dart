/// Build-time configuration. Override with:
///   flutter run --dart-define=API_URL=http://192.168.1.20:4000/api
class AppConfig {
  AppConfig._();

  /// The FieldProof API. The default reaches a backend on the developer's
  /// machine from the Android emulator (10.0.2.2 is the host's localhost).
  static const String apiUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://10.0.2.2:4000/api',
  );

  static const String appVersion = '1.0.0';
}
