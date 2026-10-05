import 'dart:math' as math;

/// A project site: a named place checked as centre + radius.
class Site {
  const Site({
    required this.id,
    required this.name,
    required this.latitude,
    required this.longitude,
    required this.radiusM,
  });

  factory Site.fromJson(Map<String, dynamic> json) => Site(
        id: json['id'] as String,
        name: json['name'] as String,
        latitude: (json['latitude'] as num).toDouble(),
        longitude: (json['longitude'] as num).toDouble(),
        radiusM: (json['radiusM'] as num).toInt(),
      );

  final String id;
  final String name;
  final double latitude;
  final double longitude;
  final int radiusM;
}

/// Great-circle distance in metres (same formula as the server).
double distanceMeters(double lat1, double lon1, double lat2, double lon2) {
  const rad = math.pi / 180;
  final dLat = (lat2 - lat1) * rad;
  final dLon = (lon2 - lon1) * rad;
  final h = math.pow(math.sin(dLat / 2), 2) +
      math.cos(lat1 * rad) * math.cos(lat2 * rad) * math.pow(math.sin(dLon / 2), 2);
  return 2 * 6371000 * math.asin(math.min(1.0, math.sqrt(h)));
}

class SiteMatch {
  const SiteMatch(this.site, this.meters, this.inside);

  final Site site;
  final double meters;
  final bool inside;

  /// "Inside Plot B" or "420 m from Plot B" / "3.2 km from Plot B".
  String get label {
    if (inside) return 'Inside ${site.name}';
    final distance = meters >= 1000 ? '${(meters / 1000).toStringAsFixed(1)} km' : '${meters.round()} m';
    return '$distance from ${site.name}';
  }
}

/// Nearest site to a fix. GPS accuracy counts in the worker's favour, as on the server.
SiteMatch? nearestSite(List<Site> sites, double latitude, double longitude, double accuracyM) {
  if (sites.isEmpty) return null;
  SiteMatch? best;
  for (final site in sites) {
    final meters = distanceMeters(latitude, longitude, site.latitude, site.longitude);
    if (best == null || meters < best.meters) {
      best = SiteMatch(site, meters, meters <= site.radiusM + accuracyM);
    }
  }
  return best;
}
