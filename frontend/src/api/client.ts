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

type ApiError = { error?: { message?: string; details?: unknown } };
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({})) as T & ApiError;
  if (!response.ok) throw new Error(data.error?.message || 'Request failed');
  return data;
}
