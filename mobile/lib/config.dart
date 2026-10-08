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

  /// Where the web app lives, for public passport links the app shows.
  /// Defaults to the API's origin without `/api`, which is right once both
  /// are deployed behind one domain; override with --dart-define=WEB_URL=…
  static const String _webUrlOverride = String.fromEnvironment('WEB_URL', defaultValue: '');
  static String get webUrl => _webUrlOverride.isNotEmpty ? _webUrlOverride : apiUrl.replaceFirst(RegExp(r'/api/?$'), '');

  static const String appVersion = '2.0.0';
}
