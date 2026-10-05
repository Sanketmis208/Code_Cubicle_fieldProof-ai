import { API_URL, api, organizationHeaders, toApiError } from './client';
import type { Asset, EvidenceSearchIntent } from '@/types';

export type AssetFilters = { projectId?: string; resourceType?: string; activity?: string; search?: string; favorite?: boolean; sort?: 'newest' | 'oldest' | 'filename'; from?: string; to?: string; page?: number; limit?: number; trustStatus?: string; reviewStatus?: string; captureSource?: string };

export type UploadResult = {
  assets: Asset[];
  /** Files not stored because the identical file is already in this project (or twice in the batch). */
  skipped: Array<{ filename: string; reason: 'ALREADY_UPLOADED' | 'DUPLICATE_IN_BATCH'; existingAssetId?: string }>;
  clusters: Array<{ id: string; assetCount: number; representativeIds: string[] }>;
};

export const assetsApi = {
  list: (filters: AssetFilters = {}) => {
    const query = new URLSearchParams(Object.entries(filters).filter(([,value]) => value !== undefined && value !== '').map(([key,value]) => [key,String(value)]));
    return api<{ assets: Asset[]; pagination: { page: number; limit: number; total: number; pages: number } }>(`/assets?${query}`);
  },
  get: (id: string) => api<{ asset: Asset }>(`/assets/${id}`),
  analyze: (id: string, force = false) => api<{ analysis: Asset['analysis']; cached: boolean }>(`/assets/${id}/analyze`, { method: 'POST', body: JSON.stringify({ force }) }),
  retry: (id: string) => api<{ analysis: Asset['analysis']; cached: boolean }>(`/assets/${id}/retry`, { method: 'POST' }),
  naturalSearch: (query: string, page = 1, limit = 24) => api<{ assets: Asset[]; intent: EvidenceSearchIntent; explanation: string[]; pagination: { page: number; limit: number; total: number; pages: number } }>(`/assets/search/interpret`, { method: 'POST', body: JSON.stringify({ query, page, limit }) }),
  remove: (id: string) => api<void>(`/assets/${id}`, { method: 'DELETE' }),
  favorite: (id: string, favorite: boolean) => api<{ asset: Asset }>(`/assets/${id}/favorite`, { method: 'PATCH', body: JSON.stringify({ favorite }) }),
  upload: (projectId: string, files: File[], onProgress: (progress: number) => void, capturedByName?: string) => new Promise<UploadResult>((resolve, reject) => {
    const body = new FormData(); body.append('projectId', projectId); if (capturedByName?.trim()) body.append('capturedByName', capturedByName.trim()); files.forEach(file => body.append('files', file));
    const request = new XMLHttpRequest();
    // projectId in the URL lets the server check access before receiving the files.
    request.open('POST', `${API_URL}/assets/upload?projectId=${encodeURIComponent(projectId)}`); request.withCredentials = true;
    Object.entries(organizationHeaders()).forEach(([key, value]) => request.setRequestHeader(key, value));
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)); };
    request.onload = () => { let response: Partial<UploadResult> & { error?: { message?: string; code?: string } } = {}; try { response = JSON.parse(request.responseText) as typeof response; } catch { /* handled below */ }
      if (request.status >= 200 && request.status < 300 && response.assets) resolve({ assets: response.assets, skipped: response.skipped ?? [], clusters: response.clusters ?? [] });
      else reject(toApiError(request.status, response, 'Upload failed'));
    };
    request.onerror = () => reject(new Error('Upload failed because the network connection was interrupted'));
    request.send(body);
  }),
};
