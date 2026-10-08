import { api } from './client';
import type { AddMemberResult, AuditEntry, Membership, OrgMember, OrgRole, OrgType, Organization, ProjectTeam } from '@/types';

const json = (body: unknown) => JSON.stringify(body);

export const orgsApi = {
  mine: () => api<{ memberships: Membership[] }>('/orgs'),
  create: (input: { name: string; type?: OrgType }) =>
    api<{ organization: Organization; role: OrgRole }>('/orgs', { method: 'POST', body: json(input) }),
  get: (orgId: string) =>
    api<{ organization: Organization & { _count: { memberships: number; projects: number } }; role: OrgRole }>(`/orgs/${orgId}`),
  update: (orgId: string, input: Partial<Pick<Organization, 'name' | 'type' | 'logoUrl'>>) =>
    api<{ organization: Organization }>(`/orgs/${orgId}`, { method: 'PATCH', body: json(input) }),
  members: (orgId: string) => api<{ members: OrgMember[] }>(`/orgs/${orgId}/members`),
  setRole: (orgId: string, userId: string, role: OrgRole) =>
    api<{ member: OrgMember }>(`/orgs/${orgId}/members/${userId}`, { method: 'PATCH', body: json({ role }) }),
  removeMember: (orgId: string, userId: string) => api<void>(`/orgs/${orgId}/members/${userId}`, { method: 'DELETE' }),
  addMember: (orgId: string, input: { name: string; email: string; role: OrgRole }) =>
    api<AddMemberResult>(`/orgs/${orgId}/members`, { method: 'POST', body: json(input) }),
  resendSetup: (orgId: string, userId: string) =>
    api<{ emailSent: boolean; setupLink: string | null }>(`/orgs/${orgId}/members/${userId}/resend-setup`, { method: 'POST' }),
  audit: (orgId: string) =>
    api<{ entries: AuditEntry[]; integrity: { valid: boolean; entries: number; brokenAt: number | null } }>(`/orgs/${orgId}/audit`),
  projectTeam: (projectId: string) => api<ProjectTeam>(`/projects/${projectId}/members`),
  assign: (projectId: string, userId: string) =>
    api<{ assigned: true }>(`/projects/${projectId}/members`, { method: 'POST', body: json({ userId }) }),
  unassign: (projectId: string, userId: string) => api<void>(`/projects/${projectId}/members/${userId}`, { method: 'DELETE' }),
};
