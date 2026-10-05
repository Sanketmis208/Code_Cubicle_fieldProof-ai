import { createHash } from 'node:crypto';
import exifr from 'exifr';
import { env } from '../config/env.js';

/** The subset of EXIF the trust checks use. Times are ISO strings in UTC. */
export type ExifSummary = {
  make?: string;
  model?: string;
  software?: string;
  /** Camera time converted to UTC using OffsetTimeOriginal, or the configured default offset. */
  capturedAt?: string;
  capturedAtRaw?: string;
  offset?: string;
  offsetAssumed?: boolean;
  latitude?: number;
  longitude?: number;
  altitude?: number;
};

export function sha256(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

// Editors and filters whose name in the Software tag means the pixels were
// changed after capture. Camera firmware strings are deliberately absent.
const EDITORS = /photoshop|lightroom|snapseed|gimp|picsart|canva|facetune|vsco|pixelmator|affinity|meitu|fotor|polarr|remini/i;

export function editingSoftware(software?: string) {
  return software && EDITORS.test(software) ? software : undefined;
}

/** WhatsApp renames forwarded media and strips EXIF: IMG-20260115-WA0007.jpg, "WhatsApp Image 2026-01-15 at ...". */
export function looksForwardedByWhatsApp(filename: string) {
  return /^(IMG|VID)-\d{8}-WA\d{3,}/i.test(filename) || /^WhatsApp (Image|Video) /i.test(filename);
}

/** "2026:01:15 10:30:00" + "+05:30" → ISO UTC. EXIF stores local time without a zone. */
export function exifTimeToIso(raw: string, offset?: string) {
  const match = raw.trim().match(/^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return undefined;
  const [, y, mo, d, h, mi, s = '00'] = match;
  const zone = offset && /^[+-]\d{2}:\d{2}$/.test(offset) ? offset : env.EXIF_DEFAULT_UTC_OFFSET;
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${zone}`);
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 1990) return undefined;
  return date.toISOString();
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : undefined);
const finite = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

/**
 * Parses EXIF from the original upload buffer. Never throws: missing or
 * corrupt metadata is a normal field condition (forwards, screenshots).
 */
export async function readExif(buffer: Buffer, mimetype: string): Promise<ExifSummary | null> {
  if (!mimetype.startsWith('image/')) return null;
  try {
    const raw = (await exifr.parse(buffer, {
      tiff: true, exif: true, gps: true, ifd1: false, xmp: false, icc: false, iptc: false, jfif: false,
      reviveValues: false, translateValues: false,
    })) as Record<string, unknown> | undefined;
    if (!raw) return null;
    const capturedAtRaw = text(raw.DateTimeOriginal) ?? text(raw.CreateDate) ?? text(raw.DateTime);
    const offset = text(raw.OffsetTimeOriginal) ?? text(raw.OffsetTime);
    const latitude = finite(raw.latitude);
    const longitude = finite(raw.longitude);
    const validFix = latitude !== undefined && longitude !== undefined && !(latitude === 0 && longitude === 0)
      && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
    const summary: ExifSummary = {
      make: text(raw.Make),
      model: text(raw.Model),
      software: text(raw.Software),
      capturedAtRaw,
      capturedAt: capturedAtRaw ? exifTimeToIso(capturedAtRaw, offset) : undefined,
      offset,
      offsetAssumed: capturedAtRaw ? !offset : undefined,
      latitude: validFix ? latitude : undefined,
      longitude: validFix ? longitude : undefined,
      altitude: finite(raw.GPSAltitude),
    };
    const present = Object.values(summary).some((value) => value !== undefined);
    return present ? JSON.parse(JSON.stringify(summary)) : null;
  } catch {
    return null;
  }
}

/** True when EXIF carries real camera provenance (not just an editor's stamp). */
export function hasCameraMetadata(exif: ExifSummary | null | undefined) {
  return Boolean(exif && (exif.make || exif.model) && exif.capturedAt);
}

/** Hamming distance between two 64-bit hex perceptual hashes; null when not comparable. */
export function phashDistance(a?: string | null, b?: string | null) {
  if (!a || !b || a.length !== b.length || !/^[0-9a-f]+$/i.test(a + b)) return null;
  let diff = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (diff) {
    count += Number(diff & 1n);
    diff >>= 1n;
  }
  return count;
}

/** Great-circle distance in metres. */
export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}
