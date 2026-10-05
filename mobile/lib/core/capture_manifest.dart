import 'dart:convert';

/// ISO-8601 in UTC with millisecond precision ("2026-02-10T05:00:00.000Z"),
/// the format the API validates.
String isoMillis(DateTime time) {
  final utc = time.toUtc();
  String two(int value) => value.toString().padLeft(2, '0');
  String three(int value) => value.toString().padLeft(3, '0');
  return '${utc.year.toString().padLeft(4, '0')}-${two(utc.month)}-${two(utc.day)}'
      'T${two(utc.hour)}:${two(utc.minute)}:${two(utc.second)}.${three(utc.millisecond)}Z';
}

/// The facts recorded at the shutter. The JSON string built here is exactly
/// what the device signs and exactly what is uploaded, so the server verifies
/// the signature over the same bytes without any re-serialisation.
class CaptureManifest {
  const CaptureManifest({
    required this.clientCaptureId,
    required this.projectId,
    required this.sha256,
    required this.capturedAt,
    required this.timeSource,
    required this.deviceId,
    this.latitude,
    this.longitude,
    this.accuracyM,
    this.mockLocation,
  });

  final String clientCaptureId;
  final String projectId;
  final String sha256;
  final DateTime capturedAt;

  /// TRUSTED when the time comes from the server clock plus the phone's
  /// monotonic timer since the last sync; DEVICE when only the wall clock was available.
  final String timeSource;
  final String deviceId;
  final double? latitude;
  final double? longitude;
  final double? accuracyM;
  final bool? mockLocation;

  Map<String, Object?> toJson() => {
        'clientCaptureId': clientCaptureId,
        'projectId': projectId,
        'sha256': sha256,
        'capturedAt': isoMillis(capturedAt),
        'timeSource': timeSource,
        'latitude': latitude,
        'longitude': longitude,
        'accuracyM': accuracyM,
        'mockLocation': mockLocation,
        'deviceId': deviceId,
      };

  /// Serialised once; sign and send this exact string.
  String encode() => jsonEncode(toJson());
}
