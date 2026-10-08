import 'package:geolocator/geolocator.dart';

/// One GPS reading as recorded at the shutter.
class Fix {
  const Fix({required this.latitude, required this.longitude, required this.accuracyM, required this.mocked});

  factory Fix.fromPosition(Position position) => Fix(
        latitude: position.latitude,
        longitude: position.longitude,
        accuracyM: position.accuracy,
        mocked: position.isMocked,
      );

  final double latitude;
  final double longitude;
  final double accuracyM;

  /// Android reports when a mock-location app supplied the fix.
  final bool mocked;
}

/// GPS runs only while the camera screen is open; nobody is tracked in the background.
class LocationService {
  /// Never throws; returns false when location is off or refused, and the
  /// worker can still take the photo (it is recorded as "no GPS").
  Future<bool> ensurePermission() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return false;
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
      return permission == LocationPermission.always || permission == LocationPermission.whileInUse;
    } catch (_) {
      return false;
    }
  }

  /// One reading, for placing a site; null when location is off or refused.
  static Future<Fix?> currentFix() async {
    if (!await LocationService().ensurePermission()) return null;
    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 15)),
      );
      return Fix.fromPosition(position);
    } catch (_) {
      return null;
    }
  }

  Stream<Fix> watch() => Geolocator.getPositionStream(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 0),
      ).map(Fix.fromPosition);
}
