import '../api/api_client.dart';

/// Capture time that does not depend on the phone's wall clock, which field
/// phones often have wrong. At each sync the server's time is stored with a
/// monotonic stopwatch; later, time = server time + elapsed. Changing the
/// phone's clock does not move it. Before the first sync (app opened offline)
/// the wall clock is used and labelled DEVICE, and the server judges it.
class TrustedClock {
  DateTime? _serverAtSync;
  final Stopwatch _sinceSync = Stopwatch();

  bool get isTrusted => _serverAtSync != null;

  Future<void> sync(ApiClient api) async {
    final roundTrip = Stopwatch()..start();
    final response = await api.get('/capture/time');
    roundTrip.stop();
    final server = DateTime.parse(response['serverTime'] as String).toUtc();
    // The server stamped its time roughly half-way through the round trip.
    _serverAtSync = server.add(Duration(microseconds: roundTrip.elapsedMicroseconds ~/ 2));
    _sinceSync
      ..reset()
      ..start();
  }

  ({DateTime time, String source}) now() {
    final base = _serverAtSync;
    if (base == null) return (time: DateTime.now().toUtc(), source: 'DEVICE');
    return (time: base.add(_sinceSync.elapsed), source: 'TRUSTED');
  }
}
