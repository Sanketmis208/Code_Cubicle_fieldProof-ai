import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import './support/harness.js';
import { evaluateTrust, type TrustInput } from '../src/trust/engine.js';
import { exifTimeToIso, looksForwardedByWhatsApp, phashDistance, readExif } from '../src/trust/provenance.js';
import { jpegWithExif } from './support/jpeg.js';

const now = new Date('2026-03-01T12:00:00Z');
const base = (overrides: Partial<TrustInput> = {}): TrustInput => ({
  captureSource: 'WEB_UPLOAD',
  originalFilename: 'IMG_1234.jpg',
  resourceType: 'IMAGE',
  exif: { make: 'Xiaomi', model: 'Redmi Note 12', capturedAt: '2026-02-10T05:00:00.000Z' },
  capturedAt: new Date('2026-02-10T05:00:00Z'),
  capturedAtSource: 'EXIF',
  latitude: 26.9124,
  longitude: 75.7873,
  locationSource: 'EXIF',
  gpsAccuracyM: null,
  qualityScore: 0.8,
  createdAt: now,
  projectId: 'p1',
  eventClusterId: 'e1',
  project: { startDate: new Date('2026-01-01'), endDate: null },
  sites: [{ id: 's1', name: 'Plot B', latitude: 26.9124, longitude: 75.7873, radiusM: 300 }],
  exactMatches: [],
  nearMatches: [],
  authenticity: null,
  now,
  ...overrides,
});
const check = (result: ReturnType<typeof evaluateTrust>, name: string) => result.checks.find((c) => c.check === name);

describe('trust engine', () => {
  it('rates a camera photo taken inside the site, in period, as strong', () => {
    const result = evaluateTrust(base());
    assert.equal(result.status, 'STRONG');
    assert.equal(result.score, 85);
    assert.equal(result.siteId, 's1');
    assert.equal(check(result, 'LOCATION')?.result, 'PASS');
    assert.equal(check(result, 'CAPTURE_TIME')?.result, 'PASS');
  });

  it('treats a WhatsApp forward as unproven, not as fraud', () => {
    const result = evaluateTrust(base({
      originalFilename: 'IMG-20260210-WA0007.jpg', exif: null, capturedAt: null, capturedAtSource: null,
      latitude: null, longitude: null, locationSource: null,
    }));
    assert.equal(result.status, 'MODERATE');
    assert.equal(result.score, 55);
    assert.match(check(result, 'SOURCE')!.message, /WhatsApp/);
    assert.ok(result.checks.every((c) => !c.hard));
  });

  it('hard-flags a byte-identical file already used elsewhere', () => {
    const result = evaluateTrust(base({
      exactMatches: [{ id: 'old', projectId: 'p0', projectName: 'Last year', effectiveAt: new Date('2025-08-12'), eventClusterId: null }],
    }));
    assert.equal(result.status, 'NEEDS_SECOND_LOOK');
    assert.ok(result.score <= 25);
    assert.equal(check(result, 'EXACT_REUSE')?.relatedAssetId, 'old');
    assert.match(check(result, 'EXACT_REUSE')!.message, /2025-08-12/);
  });

  it('flags a visually identical photo from another day, but not a burst of the same moment', () => {
    const reuse = evaluateTrust(base({
      nearMatches: [{ id: 'old', projectId: 'p1', projectName: 'Plantation', effectiveAt: new Date('2025-11-01'), eventClusterId: 'e0', distance: 3 }],
    }));
    assert.equal(check(reuse, 'NEAR_DUPLICATE')?.weight, -40);
    assert.match(check(reuse, 'NEAR_DUPLICATE')!.message, /Needs a second look/);

    const burst = evaluateTrust(base({
      nearMatches: [{ id: 'sibling', projectId: 'p1', projectName: 'Plantation', effectiveAt: new Date('2026-02-10T05:00:30Z'), eventClusterId: 'e1', distance: 4 }],
    }));
    assert.equal(check(burst, 'NEAR_DUPLICATE'), undefined);
    assert.equal(check(burst, 'BURST')?.weight, 0);
    assert.equal(burst.status, 'STRONG');
  });

  it('applies time rules: outside the project period, and clocks in the future', () => {
    const before = evaluateTrust(base({ capturedAt: new Date('2025-06-01') }));
    assert.equal(check(before, 'CAPTURE_TIME')?.weight, -30);
    const future = evaluateTrust(base({ capturedAt: new Date('2027-01-01') }));
    assert.equal(check(future, 'CAPTURE_TIME')?.weight, -15);
  });

  it('reports distance outside the nearest site', () => {
    const result = evaluateTrust(base({ latitude: 26.95, longitude: 75.7873 }));
    const location = check(result, 'LOCATION')!;
    assert.equal(location.result, 'WARN');
    assert.match(location.message, /4\.\d km outside the nearest site “Plot B”/);
    assert.equal(result.siteId, null);
  });

  it('counts GPS accuracy in favour of the photographer at the site edge', () => {
    const edge = evaluateTrust(base({ latitude: 26.9155, gpsAccuracyM: 80 }));
    assert.equal(check(edge, 'LOCATION')?.result, 'PASS');
  });

  it('penalizes editing software, recapture and synthetic signs', () => {
    assert.equal(check(evaluateTrust(base({ exif: { make: 'Xiaomi', model: 'X', capturedAt: '2026-02-10T05:00:00.000Z', software: 'Snapseed 2.0' } })), 'EDITING')?.weight, -15);
    const recapture = evaluateTrust(base({ authenticity: { recaptureLikelihood: 'high', syntheticLikelihood: 'low' } }));
    assert.equal(check(recapture, 'RECAPTURE')?.weight, -45);
    assert.equal(recapture.status, 'NEEDS_SECOND_LOOK');
    const synthetic = evaluateTrust(base({ authenticity: { recaptureLikelihood: 'low', syntheticLikelihood: 'high' } }));
    assert.equal(check(synthetic, 'SYNTHETIC')?.hard, true);
  });

  it('trusts a signed app capture most, and distrusts mock GPS or a broken signature', () => {
    const app = evaluateTrust(base({ captureSource: 'APP_CAPTURE', exif: null, capturedAtSource: 'DEVICE', locationSource: 'DEVICE', device: { signatureValid: true, mockLocation: false } }));
    assert.equal(app.score, 100);
    const mocked = evaluateTrust(base({ captureSource: 'APP_CAPTURE', device: { signatureValid: true, mockLocation: true } }));
    assert.equal(mocked.status, 'NEEDS_SECOND_LOOK');
    const tampered = evaluateTrust(base({ captureSource: 'APP_CAPTURE', device: { signatureValid: false } }));
    assert.equal(check(tampered, 'SIGNATURE')?.result, 'FAIL');
  });

  it('labels a burned-in GPS stamp as declared, not proven', () => {
    const result = evaluateTrust(base({
      authenticity: { burnedInStamp: { present: true, text: 'Bassi, Rajasthan 26.83N 76.05E 10 Aug 2026', latitude: 26.83, longitude: 76.05, capturedAt: '2026-08-10 09:12' } },
    }));
    assert.match(check(result, 'STAMP')!.message, /declared, not proven/);
  });
});

describe('provenance helpers', () => {
  it('converts EXIF local time to UTC with the recorded or default offset', () => {
    assert.equal(exifTimeToIso('2026:01:15 10:30:00', '+05:30'), '2026-01-15T05:00:00.000Z');
    assert.equal(exifTimeToIso('2026:01:15 10:30:00'), '2026-01-15T05:00:00.000Z');
    assert.equal(exifTimeToIso('2026-08-10 09:12'), '2026-08-10T03:42:00.000Z');
    assert.equal(exifTimeToIso('0000:00:00 00:00:00'), undefined);
  });

  it('measures perceptual hash distance', () => {
    assert.equal(phashDistance('ffffffffffffffff', 'fffffffffffffffe'), 1);
    assert.equal(phashDistance('0000000000000000', 'ffffffffffffffff'), 64);
    assert.equal(phashDistance('abc', null), null);
  });

  it('recognizes WhatsApp file names', () => {
    assert.ok(looksForwardedByWhatsApp('IMG-20260115-WA0007.jpg'));
    assert.ok(looksForwardedByWhatsApp('WhatsApp Image 2026-01-15 at 10.30.12.jpeg'));
    assert.ok(!looksForwardedByWhatsApp('IMG_1234.jpg'));
  });

  it('reads camera, time and GPS from real EXIF bytes and ignores (0,0) fixes', async () => {
    const exif = await readExif(jpegWithExif({ make: 'Xiaomi', model: 'Redmi Note 12', dateTimeOriginal: '2026:01:15 10:30:00', offset: '+05:30', latitude: 26.9124, longitude: 75.7873 }), 'image/jpeg');
    assert.equal(exif?.make, 'Xiaomi');
    assert.equal(exif?.capturedAt, '2026-01-15T05:00:00.000Z');
    assert.ok(Math.abs(exif!.latitude! - 26.9124) < 1e-4);
    const nullIsland = await readExif(jpegWithExif({ make: 'X', latitude: 0, longitude: 0 }), 'image/jpeg');
    assert.equal(nullIsland?.latitude, undefined);
    assert.equal(await readExif(Buffer.from('not an image'), 'image/jpeg'), null);
  });
});
