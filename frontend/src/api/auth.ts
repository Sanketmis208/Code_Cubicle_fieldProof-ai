import { api } from './client';
import type { Session } from '@/types';

export type RegisterInput = { name: string; email: string; password: string; organizationName?: string; inviteCode?: string };

export const authApi = {
  me: () => api<Session>('/auth/me'),
  login: (input: { email: string; password: string }) => api<Session>('/auth/login', { method: 'POST', body: JSON.stringify(input) }),
  register: (input: RegisterInput) => api<Session>('/auth/register', { method: 'POST', body: JSON.stringify(input) }),
  logout: () => api<void>('/auth/logout', { method: 'POST' }),
};
