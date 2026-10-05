import type { OrgRole, OrgType } from '@/types';

export const ROLES: OrgRole[] = ['OWNER', 'ADMIN', 'PROGRAM_MANAGER', 'VERIFIER', 'FIELD_WORKER', 'VIEWER'];

export const ROLE_INFO: Record<OrgRole, { label: string; description: string; tone: string }> = {
  OWNER: { label: 'Owner', description: 'Full control, including other owners and the organization itself.', tone: 'bg-ink text-lime' },
  ADMIN: { label: 'Admin', description: 'Runs the workspace: members, invites, every project and the audit log.', tone: 'bg-emerald-900 text-white' },
  PROGRAM_MANAGER: { label: 'Program manager', description: 'Creates projects, assigns the team, generates comparisons and reports.', tone: 'bg-emerald-100 text-emerald-900' },
  VERIFIER: { label: 'Verifier', description: 'Reviews evidence on assigned projects; cannot upload, so never checks their own work.', tone: 'bg-sky-100 text-sky-900' },
  FIELD_WORKER: { label: 'Field worker', description: 'Uploads evidence to assigned projects only.', tone: 'bg-amber-100 text-amber-900' },
  VIEWER: { label: 'Viewer', description: 'Read-only access to every project, for funders or leadership.', tone: 'bg-stone-200 text-stone-800' },
};

export const ORG_TYPES: Array<{ value: OrgType; label: string }> = [
  { value: 'NGO', label: 'NGO / non-profit' },
  { value: 'CSR', label: 'CSR team' },
  { value: 'GOVERNMENT', label: 'Government department' },
  { value: 'SOCIAL_ENTERPRISE', label: 'Social enterprise' },
  { value: 'OTHER', label: 'Other' },
];

const RANK: Record<OrgRole, number> = { OWNER: 100, ADMIN: 80, PROGRAM_MANAGER: 60, VERIFIER: 40, FIELD_WORKER: 20, VIEWER: 10 };

/** Mirrors the server rule so the UI only offers changes the API will accept. */
export function canManageRole(actorRole: OrgRole, targetRole: OrgRole, nextRole?: OrgRole) {
  if (actorRole === 'OWNER') return true;
  if (actorRole !== 'ADMIN') return false;
  return RANK[targetRole] < RANK.ADMIN && (nextRole === undefined || RANK[nextRole] < RANK.ADMIN);
}

export function grantableRoles(actorRole: OrgRole) {
  return ROLES.filter((role) => canManageRole(actorRole, role, role));
}
