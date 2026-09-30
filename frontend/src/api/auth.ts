import { api } from './client';
import type { User } from '@/types';
export const authApi = {
  me: () => api<{ user: User }>('/auth/me'),
  login: (input: { email: string; password: string }) => api<{ user: User }>('/auth/login', { method: 'POST', body: JSON.stringify(input) }),
  register: (input: { name: string; email: string; password: string; organizationName?: string }) => api<{ user: User }>('/auth/register', { method: 'POST', body: JSON.stringify(input) }),
  logout: () => api<void>('/auth/logout', { method: 'POST' }),
};
