import type { CaptureSource, ReviewStatus, TrustStatus } from '@/types';

/** Field wording: nothing is "fraud"; weak evidence "needs a second look". */
export const TRUST_INFO: Record<TrustStatus, { label: string; tone: string; dot: string }> = {
  STRONG: { label: 'Strong', tone: 'bg-emerald-100 text-emerald-900', dot: 'bg-emerald-500' },
  MODERATE: { label: 'Moderate', tone: 'bg-sky-100 text-sky-900', dot: 'bg-sky-500' },
  NEEDS_SECOND_LOOK: { label: 'Needs a second look', tone: 'bg-amber-100 text-amber-900', dot: 'bg-amber-500' },
  NOT_ASSESSED: { label: 'Not assessed', tone: 'bg-stone-100 text-stone-600', dot: 'bg-stone-400' },
};

export const REVIEW_INFO: Record<ReviewStatus, { label: string; tone: string }> = {
  PENDING: { label: 'Awaiting review', tone: 'bg-stone-100 text-stone-700' },
  APPROVED: { label: 'Approved', tone: 'bg-emerald-600 text-white' },
  REJECTED: { label: 'Rejected', tone: 'bg-red-100 text-red-800' },
  RESHOOT_REQUESTED: { label: 'Re-shoot requested', tone: 'bg-violet-100 text-violet-900' },
};

export const SOURCE_INFO: Record<CaptureSource, { label: string; detail: string }> = {
  APP_CAPTURE: { label: 'Live · app', detail: 'Captured live in the FieldProof app and signed on the device' },
  WEB_LIVE_CAPTURE: { label: 'Live · browser', detail: 'Captured live in the browser; place and server time recorded at the shutter' },
  WEB_UPLOAD: { label: 'Uploaded file', detail: 'Uploaded from a file; provenance comes from its metadata' },
};

export const FACT_SOURCE: Record<string, string> = {
  EXIF: 'camera metadata', STAMP: 'stamp printed on the photo (declared)', DEVICE: 'capturing device', SERVER: 'server time',
};

export const CHECK_LABEL: Record<string, string> = {
  SOURCE: 'Source', SIGNATURE: 'Device signature', MOCK_LOCATION: 'GPS authenticity', EXACT_REUSE: 'Reuse',
  NEAR_DUPLICATE: 'Possible reuse', BURST: 'Burst', CAPTURE_TIME: 'Capture time', LOCATION: 'Location',
  EDITING: 'Editing', RECAPTURE: 'Photo of a screen', SYNTHETIC: 'AI-generated', STAMP: 'GPS stamp', QUALITY: 'Image quality',
};
