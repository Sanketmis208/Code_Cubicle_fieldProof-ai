import { api } from './client';
import type { Project, ProjectInput, ProjectInsight } from '@/types';
export const projectsApi = {
  list: () => api<{ projects: Project[] }>('/projects'),
  get: (id: string) => api<{ project: Project }>(`/projects/${id}`),
  create: (input: ProjectInput) => api<{ project: Project }>('/projects', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: Partial<ProjectInput>) => api<{ project: Project }>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string) => api<void>(`/projects/${id}`, { method: 'DELETE' }),
  generateSummary: (id: string) => api<{ insight: ProjectInsight }>(`/projects/${id}/summary`, { method: 'POST' }),
  summary: () => api<{ projects: number; assets: number; analyzed: number; pending: number; failed: number; comparisons: number; reports: number; recentAssets: Array<Pick<import('@/types').Asset, 'id'|'originalFilename'|'secureUrl'|'resourceType'|'aiStatus'|'activity'|'createdAt'|'project'>> }>('/dashboard/summary'),
};
