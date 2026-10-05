import { API_URL, api, organizationHeaders, toApiError } from './client';
import type { Asset, ClaimResult, DerivedAsset, Passport, PublicPassport, ReviewItem, ReviewStatus, Site, StoryKind } from '@/types';

const json = (body: unknown) => JSON.stringify(body);
type Decision = Exclude<ReviewStatus, 'PENDING'>;

export const reviewApi = {
  queue: (params: { projectId?: string; status?: ReviewStatus } = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as Array<[string, string]>);
    return api<{ assets: ReviewItem[]; counts: Partial<Record<ReviewStatus, number>>; selfReviewAllowed: boolean }>(`/review/queue?${query}`);
  },
  decide: (assetId: string, decision: Decision, note?: string) =>
    api<{ asset: Asset }>(`/review/assets/${assetId}`, { method: 'POST', body: json({ decision, note }) }),
  decideEvent: (clusterId: string, decision: Decision, note?: string) =>
    api<{ reviewed: number; left: Array<{ id: string; reason: 'HARD_FLAG' | 'OWN_UPLOAD' }> }>(`/review/events/${clusterId}`, { method: 'POST', body: json({ decision, note }) }),
};

export const passportApi = {
  get: (assetId: string) => api<{ passport: Passport }>(`/assets/${assetId}/passport`),
  share: (assetId: string) => api<{ publicPath: string; token: string }>(`/assets/${assetId}/share`, { method: 'POST' }),
  unshare: (assetId: string) => api<void>(`/assets/${assetId}/share`, { method: 'DELETE' }),
  public: (token: string) => api<{ passport: PublicPassport }>(`/public/passport/${encodeURIComponent(token)}`),
};

export const sitesApi = {
  list: (projectId: string) => api<{ sites: Site[] }>(`/projects/${projectId}/sites`),
  create: (projectId: string, input: { name: string; latitude: number; longitude: number; radiusM: number }) =>
    api<{ site: Site; rechecked: number }>(`/projects/${projectId}/sites`, { method: 'POST', body: json(input) }),
  remove: (projectId: string, siteId: string) => api<void>(`/projects/${projectId}/sites/${siteId}`, { method: 'DELETE' }),
};

export const storyApi = {
  list: (projectId?: string) => api<{ derived: DerivedAsset[] }>(`/story${projectId ? `?projectId=${projectId}` : ''}`),
  compose: (input: { kind: StoryKind; assetIds: string[]; headline: string; subline?: string; blurFaces: boolean }) =>
    api<{ derived: DerivedAsset; passportUrl: string }>('/story', { method: 'POST', body: json(input) }),
};

export const claimsApi = {
  check: (claim: string, projectId?: string) =>
    api<ClaimResult>('/claims/check', { method: 'POST', body: json({ claim, ...(projectId && { projectId }) }) }),
};

export type CaptureManifest = {
  clientCaptureId: string; projectId: string; sha256: string; capturedAt: string; timeSource: 'TRUSTED' | 'DEVICE';
  latitude: number | null; longitude: number | null; accuracyM: number | null; mockLocation: boolean | null;
};

export const captureApi = {
  time: () => api<{ serverTime: string }>('/capture/time'),
  projects: () => api<{ projects: Array<{ id: string; name: string; location?: string | null; sites: Site[] }>; canCapture: boolean }>('/capture/projects'),
  /** Browser live capture: the server ignores the browser clock and recomputes the hash. */
  upload: (blob: Blob, manifest: CaptureManifest) => {
    const form = new FormData();
    form.append('file', blob, `live-${manifest.clientCaptureId}.jpg`);
    form.append('manifest', JSON.stringify(manifest));
    form.append('source', 'WEB');
    return fetch(`${API_URL}/capture/upload`, { method: 'POST', body: form, credentials: 'include', headers: organizationHeaders() })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw toApiError(response.status, data, 'Capture failed');
        return data as { assets: Asset[]; skipped: Array<{ filename: string; reason: string; existingAssetId?: string }> };
      });
  },
};
