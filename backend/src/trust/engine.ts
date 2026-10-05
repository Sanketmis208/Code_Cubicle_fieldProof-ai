import type { CaptureSource, TrustResult, TrustStatus } from '@prisma/client';
import { distanceMeters, editingSoftware, hasCameraMetadata, looksForwardedByWhatsApp, type ExifSummary } from './provenance.js';

/**
 * Pure trust evaluation: facts in, explained checks and a score out. No I/O,
 * so every rule is unit-tested. The rules follow two field principles:
 * nothing is ever auto-rejected (checks only explain), and honest-but-messy
 * evidence (WhatsApp forwards, bursts, weak GPS) costs little.
 */

export type Likelihood = 'low' | 'medium' | 'high';

export type Authenticity = {
  recaptureLikelihood?: Likelihood;
  syntheticLikelihood?: Likelihood;
  burnedInStamp?: { present: boolean; text: string | null; latitude: number | null; longitude: number | null; capturedAt: string | null };
  notes?: string[];
};

export type RelatedAsset = {
  id: string;
  projectId: string;
  projectName: string;
  /** capturedAt ?? createdAt */
  effectiveAt: Date;
  eventClusterId: string | null;
};

export type TrustInput = {
  captureSource: CaptureSource;
  originalFilename: string;
  resourceType: 'IMAGE' | 'VIDEO' | 'RAW';
  exif: ExifSummary | null;
  capturedAt: Date | null;
  capturedAtSource: string | null;
  latitude: number | null;
  longitude: number | null;
  locationSource: string | null;
  gpsAccuracyM: number | null;
  qualityScore: number | null;
  createdAt: Date;
  projectId: string;
  eventClusterId: string | null;
  project: { startDate: Date; endDate: Date | null };
  sites: Array<{ id: string; name: string; latitude: number; longitude: number; radiusM: number }>;
  /** Byte-identical files uploaded earlier in the same organization. */
  exactMatches: RelatedAsset[];
  /** Visually near-identical images uploaded earlier (perceptual hash), with distance. */
  nearMatches: Array<RelatedAsset & { distance: number }>;
  authenticity: Authenticity | null;
  /** Only for live captures. */
  device?: { signatureValid?: boolean | null; mockLocation?: boolean | null };
  now: Date;
};

export type CheckOutcome = {
  check: string;
  result: TrustResult;
  weight: number;
  hard: boolean;
  message: string;
  details?: Record<string, unknown>;
  relatedAssetId?: string;
};

export type TrustEvaluation = { score: number; status: TrustStatus; checks: CheckOutcome[]; siteId: string | null };

const DAY = 24 * 60 * 60 * 1000;
const PROJECT_GRACE = 7 * DAY;
/** Same scene within this window and project counts as one event, not reuse. */
const SAME_EVENT_WINDOW = DAY;

const day = (date: Date) => date.toISOString().slice(0, 10);

function sourceCap(input: TrustInput): { cap: number; check: CheckOutcome } {
  if (input.captureSource === 'APP_CAPTURE')
    return { cap: 100, check: { check: 'SOURCE', result: 'PASS', weight: 0, hard: false, message: 'Captured live in the FieldProof app' } };
  if (input.captureSource === 'WEB_LIVE_CAPTURE')
    return { cap: 90, check: { check: 'SOURCE', result: 'PASS', weight: 0, hard: false, message: 'Captured live in the browser; device integrity is not verified' } };
  if (hasCameraMetadata(input.exif))
    return {
      cap: 85,
      check: {
        check: 'SOURCE', result: 'INFO', weight: 0, hard: false,
        message: `Uploaded file with camera metadata (${[input.exif?.make, input.exif?.model].filter(Boolean).join(' ')})`,
      },
    };
  const forwarded = looksForwardedByWhatsApp(input.originalFilename);
  return {
    cap: 70,
    check: {
      check: 'SOURCE', result: 'INFO', weight: 0, hard: false,
      message: forwarded
        ? 'Forwarded through WhatsApp, which removes camera metadata. Provenance cannot be confirmed from the file.'
        : 'Uploaded file without camera metadata. Provenance cannot be confirmed from the file.',
      details: { forwarded },
    },
  };
}

export function evaluateTrust(input: TrustInput): TrustEvaluation {
  const checks: CheckOutcome[] = [];
  const add = (check: CheckOutcome) => checks.push(check);
  const { cap, check: source } = sourceCap(input);
  add(source);

  // Device-level signals exist only for live app captures.
  if (input.device?.signatureValid === true)
    add({ check: 'SIGNATURE', result: 'PASS', weight: 0, hard: false, message: 'Signed on the capturing device; file unchanged since capture' });
  if (input.device?.signatureValid === false)
    add({ check: 'SIGNATURE', result: 'FAIL', weight: -50, hard: true, message: 'Device signature does not match the file. It was changed after capture.' });
  if (input.device?.mockLocation)
    add({ check: 'MOCK_LOCATION', result: 'FAIL', weight: -40, hard: true, message: 'The phone reported a simulated (mock) location at capture time' });

  // Reuse: identical bytes, or near-identical pixels outside the same event.
  const exact = input.exactMatches[0];
  if (exact)
    add({
      check: 'EXACT_REUSE', result: 'FAIL', weight: -60, hard: true, relatedAssetId: exact.id,
      message: `The identical file was already submitted in “${exact.projectName}” on ${day(exact.effectiveAt)}`,
      details: { projectId: exact.projectId },
    });
  const effectiveAt = input.capturedAt ?? input.createdAt;
  const sameEvent = (match: RelatedAsset) =>
    (input.eventClusterId !== null && match.eventClusterId === input.eventClusterId) ||
    (match.projectId === input.projectId && Math.abs(match.effectiveAt.getTime() - effectiveAt.getTime()) <= SAME_EVENT_WINDOW);
  const reuse = input.nearMatches.filter((match) => !sameEvent(match)).sort((a, b) => a.distance - b.distance)[0];
  const burst = input.nearMatches.filter(sameEvent);
  if (reuse && !exact)
    add({
      check: 'NEAR_DUPLICATE', result: 'WARN', weight: -40, hard: false, relatedAssetId: reuse.id,
      message: `Looks like the same photo as one from ${day(reuse.effectiveAt)} in “${reuse.projectName}”. Needs a second look.`,
      details: { distance: reuse.distance, projectId: reuse.projectId },
    });
  else if (burst.length)
    add({ check: 'BURST', result: 'INFO', weight: 0, hard: false, message: `One of ${burst.length + 1} near-identical shots of the same moment`, details: { similar: burst.length } });

  // Time.
  if (input.capturedAt) {
    const at = input.capturedAt.getTime();
    const from = input.project.startDate.getTime() - PROJECT_GRACE;
    const to = input.project.endDate ? input.project.endDate.getTime() + PROJECT_GRACE : Number.POSITIVE_INFINITY;
    const where = input.capturedAtSource === 'STAMP' ? 'stamp on the photo' : input.capturedAtSource === 'EXIF' ? 'camera metadata' : 'capture device';
    if (at > input.now.getTime() + 10 * 60 * 1000)
      add({ check: 'CAPTURE_TIME', result: 'WARN', weight: -15, hard: false, message: `Capture time from the ${where} is in the future (${day(input.capturedAt)}); the device clock is probably wrong` });
    else if (at < from || at > to)
      add({
        check: 'CAPTURE_TIME', result: 'WARN', weight: -30, hard: false,
        message: `Captured on ${day(input.capturedAt)}, outside the project period. Needs a second look.`,
        details: { source: input.capturedAtSource },
      });
    else add({ check: 'CAPTURE_TIME', result: 'PASS', weight: 0, hard: false, message: `Captured on ${day(input.capturedAt)} (from the ${where}), within the project period` });
  } else add({ check: 'CAPTURE_TIME', result: 'INFO', weight: -5, hard: false, message: 'No capture time available; the upload time is used for ordering' });

  // Place.
  let siteId: string | null = null;
  if (input.latitude !== null && input.longitude !== null) {
    const point = { latitude: input.latitude, longitude: input.longitude };
    if (!input.sites.length)
      add({ check: 'LOCATION', result: 'INFO', weight: 0, hard: false, message: 'GPS location recorded; the project has no sites to compare against yet', details: { source: input.locationSource } });
    else {
      const nearest = input.sites
        .map((site) => ({ site, distance: distanceMeters(point, site) }))
        .sort((a, b) => a.distance - b.distance)[0]!;
      if (nearest.distance <= nearest.site.radiusM + (input.gpsAccuracyM ?? 0)) {
        siteId = nearest.site.id;
        add({ check: 'LOCATION', result: 'PASS', weight: 0, hard: false, message: `Inside site “${nearest.site.name}”`, details: { distanceM: Math.round(nearest.distance), source: input.locationSource } });
      } else {
        const km = nearest.distance >= 1000 ? `${(nearest.distance / 1000).toFixed(1)} km` : `${Math.round(nearest.distance)} m`;
        add({
          check: 'LOCATION', result: 'WARN', weight: -30, hard: false,
          message: `${km} outside the nearest site “${nearest.site.name}”. Needs a second look.`,
          details: { distanceM: Math.round(nearest.distance), siteId: nearest.site.id, source: input.locationSource },
        });
      }
    }
  } else if (input.resourceType === 'IMAGE')
    add({ check: 'LOCATION', result: 'INFO', weight: -10, hard: false, message: 'No GPS location in the file or on the photo' });

  // Editing traces.
  const editor = editingSoftware(input.exif?.software);
  if (editor) add({ check: 'EDITING', result: 'WARN', weight: -15, hard: false, message: `Saved by editing software (${editor}) after capture` });

  // Vision-model signals (added after analysis).
  const auth = input.authenticity;
  if (auth?.recaptureLikelihood === 'high')
    add({ check: 'RECAPTURE', result: 'WARN', weight: -45, hard: false, message: 'Looks like a photo of a screen or a printout, not of the scene. Needs a second look.' });
  else if (auth?.recaptureLikelihood === 'medium')
    add({ check: 'RECAPTURE', result: 'WARN', weight: -20, hard: false, message: 'May be a photo of a screen or a printout' });
  else if (auth?.recaptureLikelihood === 'low')
    add({ check: 'RECAPTURE', result: 'PASS', weight: 0, hard: false, message: 'Shows a real scene, not a photo of a screen or print' });
  if (auth?.syntheticLikelihood === 'high')
    add({ check: 'SYNTHETIC', result: 'FAIL', weight: -50, hard: true, message: 'Shows strong signs of being AI-generated or composited' });
  else if (auth?.syntheticLikelihood === 'medium')
    add({ check: 'SYNTHETIC', result: 'WARN', weight: -25, hard: false, message: 'Some signs of AI generation or compositing' });
  if (auth?.burnedInStamp?.present)
    add({
      check: 'STAMP', result: 'INFO', weight: 0, hard: false,
      message: `A GPS camera stamp is printed on the photo${auth.burnedInStamp.text ? `: “${auth.burnedInStamp.text}”` : ''}. Treated as declared, not proven.`,
      details: auth.burnedInStamp,
    });

  // Focus only ranks an event's best shots. Measured on real uploads, sharp
  // scenes with soft gradients score 0.1-0.3, so it never costs trust points.
  if (input.qualityScore !== null && input.qualityScore < 0.05 && input.resourceType === 'IMAGE')
    add({ check: 'QUALITY', result: 'INFO', weight: 0, hard: false, message: 'Image may be blurred or out of focus' });

  const hard = checks.some((check) => check.hard);
  const raw = cap + checks.reduce((sum, check) => sum + check.weight, 0);
  const score = Math.max(0, Math.min(100, hard ? Math.min(raw, 25) : raw));
  const status: TrustStatus = hard || score < 50 ? 'NEEDS_SECOND_LOOK' : score >= 80 ? 'STRONG' : 'MODERATE';
  return { score, status, checks, siteId };
}
