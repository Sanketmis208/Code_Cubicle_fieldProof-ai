import type { OrgRole } from '@prisma/client';

/**
 * Fine-grained permissions. Roles are only bundles of these, so a new role is a
 * new list here, not new checks in controllers. Viewing a project's content is
 * not a permission: any active member whose scope includes the project can read it.
 */
export const PERMISSIONS = [
  'org.settings',
  'org.members.view',
  'org.members.manage',
  'org.invites.manage',
  'audit.view',
  'project.create',
  'project.edit',
  'project.delete',
  'project.members.manage',
  'evidence.upload',
  'evidence.analyze',
  'evidence.curate',
  'evidence.delete',
  'evidence.review',
  'insight.generate',
  'comparison.create',
  'comparison.delete',
  'report.create',
  'report.delete',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const programManager: Permission[] = [
  'org.members.view',
  'project.create',
  'project.edit',
  'project.members.manage',
  'evidence.upload',
  'evidence.analyze',
  'evidence.curate',
  'evidence.delete',
  'evidence.review',
  'insight.generate',
  'comparison.create',
  'comparison.delete',
  'report.create',
  'report.delete',
];

export const ROLE_PERMISSIONS: Record<OrgRole, readonly Permission[]> = {
  OWNER: PERMISSIONS,
  ADMIN: PERMISSIONS,
  PROGRAM_MANAGER: programManager,
  VERIFIER: ['evidence.analyze', 'evidence.curate', 'evidence.review', 'comparison.create'],
  FIELD_WORKER: ['evidence.upload', 'evidence.analyze'],
  VIEWER: [],
};

/** Roles that see every project in the organization; the rest see assigned projects only. */
export const ORG_WIDE_ROLES: ReadonlySet<OrgRole> = new Set<OrgRole>(['OWNER', 'ADMIN', 'VIEWER']);

/** Used for "who may change whom": you can only manage roles strictly below your own. */
export const ROLE_RANK: Record<OrgRole, number> = {
  OWNER: 100,
  ADMIN: 80,
  PROGRAM_MANAGER: 60,
  VERIFIER: 40,
  FIELD_WORKER: 20,
  VIEWER: 10,
};

export const ROLE_LABEL: Record<OrgRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  PROGRAM_MANAGER: 'Program manager',
  VERIFIER: 'Verifier',
  FIELD_WORKER: 'Field worker',
  VIEWER: 'Viewer',
};

export function roleHas(role: OrgRole, permission: Permission) {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Whether `actorRole` may move a member from `targetRole` to `nextRole`
 * (omit `nextRole` for removal). Owners can do anything; admins can manage
 * only roles below admin and cannot grant admin or owner; nobody else can.
 */
export function canManageRole(actorRole: OrgRole, targetRole: OrgRole, nextRole?: OrgRole) {
  if (actorRole === 'OWNER') return true;
  if (actorRole !== 'ADMIN') return false;
  const limit = ROLE_RANK.ADMIN;
  return ROLE_RANK[targetRole] < limit && (nextRole === undefined || ROLE_RANK[nextRole] < limit);
}
