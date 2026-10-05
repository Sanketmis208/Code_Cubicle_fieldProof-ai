const configuredApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

function resolveApiUrl(value: string) {
  if (typeof window === 'undefined') return value;
  const url = new URL(value, window.location.origin);
  const localHosts = new Set(['localhost', '127.0.0.1']);
  if (localHosts.has(url.hostname) && localHosts.has(window.location.hostname))
    url.hostname = window.location.hostname;
  return url.toString().replace(/\/$/, '');
}

export const API_URL = resolveApiUrl(configuredApiUrl);

/**
 * The organization every list request is scoped to. Set by the auth context
 * before any page renders; requests about one resource ignore it server-side.
 */
let activeOrganizationId: string | undefined;
export function setActiveOrganizationId(id: string | undefined) {
  activeOrganizationId = id;
}
export function organizationHeaders(): Record<string, string> {
  return activeOrganizationId ? { 'X-Organization-Id': activeOrganizationId } : {};
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string, public details?: unknown) {
    super(message);
  }
}

/** Session-level failures are broadcast so the auth context can react once, centrally. */
export const SESSION_EVENT = 'fieldproof:session';
function broadcast(error: ApiError) {
  if (typeof window === 'undefined') return;
  if (error.status === 401 || error.code === 'ORG_NOT_FOUND' || error.code === 'NO_ORGANIZATION')
    window.dispatchEvent(new CustomEvent(SESSION_EVENT, { detail: { status: error.status, code: error.code } }));
}

type ApiErrorBody = { error?: { message?: string; details?: unknown; code?: string } };
export function toApiError(status: number, body: ApiErrorBody, fallback = 'Request failed') {
  return new ApiError(body.error?.message || fallback, status, body.error?.code, body.error?.details);
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...organizationHeaders(), ...init.headers },
  });
  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!response.ok) {
    const error = toApiError(response.status, data);
    // The session check itself reports 401 as "signed out", not as an event.
    if (path !== '/auth/me') broadcast(error);
    throw error;
  }
  return data;
}
