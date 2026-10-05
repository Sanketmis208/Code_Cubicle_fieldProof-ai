import 'dart:convert';

import 'package:cryptography/cryptography.dart';
import 'package:fieldproof_capture/core/capture_manifest.dart';
import 'package:fieldproof_capture/core/geo.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('isoMillis', () {
    test('formats UTC with millisecond precision', () {
      expect(isoMillis(DateTime.utc(2026, 2, 10, 5, 0, 0, 7, 999)), '2026-02-10T05:00:00.007Z');
    });

    test('converts local time to UTC', () {
      final local = DateTime(2026, 2, 10, 10, 30);
      expect(isoMillis(local).endsWith('Z'), isTrue);
      expect(DateTime.parse(isoMillis(local)).isAtSameMomentAs(local), isTrue);
    });
  });

  group('geo', () {
    const plotB = Site(id: 's1', name: 'Plot B', latitude: 26.9124, longitude: 75.7873, radiusM: 300);

    test('distance matches the server formula within a metre', () {
      // Same pair as the backend tests: 0.0376 degrees of latitude is about 4.18 km.
      expect(distanceMeters(26.9124, 75.7873, 26.95, 75.7873), closeTo(4181, 5));
    });

    test('accuracy counts in favour of the worker at the edge', () {
      final match = nearestSite(const [plotB], 26.9155, 75.7873, 80)!;
      expect(match.inside, isTrue);
      expect(match.label, 'Inside Plot B');
    });

    test('labels distance outside the site', () {
      final match = nearestSite(const [plotB], 26.95, 75.7873, 10)!;
      expect(match.inside, isFalse);
      expect(match.label, '4.2 km from Plot B');
    });

    test('no sites means no badge', () {
      expect(nearestSite(const [], 26.9, 75.7, 5), isNull);
    });
  });

  group('signed manifest', () {
    test('signature verifies over the exact uploaded string and breaks on any change', () async {
      final algorithm = Ed25519();
      final keyPair = await algorithm.newKeyPair();
      final manifest = CaptureManifest(
        clientCaptureId: 'c1',
        projectId: 'cproject12345',
        sha256: 'a' * 64,
        capturedAt: DateTime.utc(2026, 2, 10, 5),
        timeSource: 'TRUSTED',
        deviceId: 'cdevice12345',
        latitude: 26.9124,
        longitude: 75.7873,
        accuracyM: 8,
        mockLocation: false,
      ).encode();
      final signature = await algorithm.sign(utf8.encode(manifest), keyPair: keyPair);
      final publicKey = await keyPair.extractPublicKey();
      expect(publicKey.bytes.length, 32, reason: 'the server expects a raw 32-byte Ed25519 key');
      expect(await algorithm.verify(utf8.encode(manifest), signature: signature), isTrue);
      final tampered = manifest.replaceFirst('26.9124', '26.9125');
      expect(await algorithm.verify(utf8.encode(tampered), signature: signature), isFalse);
      final decoded = jsonDecode(manifest) as Map<String, dynamic>;
      expect(decoded['capturedAt'], '2026-02-10T05:00:00.000Z');
      expect(decoded['timeSource'], 'TRUSTED');
    });
  });
}
