import { api } from './client';
import type { Session, SetupPreview } from '@/types';

export type RegisterInput = { name: string; email: string; password: string; organizationName?: string };

export const authApi = {
  me: () => api<Session>('/auth/me'),
  login: (input: { email: string; password: string }) => api<Session>('/auth/login', { method: 'POST', body: JSON.stringify(input) }),
  register: (input: RegisterInput) => api<Session>('/auth/register', { method: 'POST', body: JSON.stringify(input) }),
  logout: () => api<void>('/auth/logout', { method: 'POST' }),
  setupPreview: (token: string) => api<{ setup: SetupPreview }>(`/auth/setup/${encodeURIComponent(token)}`),
  completeSetup: (token: string, password: string) => api<Session>(`/auth/setup/${encodeURIComponent(token)}`, { method: 'POST', body: JSON.stringify({ password }) }),
  forgotPassword: (email: string) => api<{ ok: true; message: string }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
};
