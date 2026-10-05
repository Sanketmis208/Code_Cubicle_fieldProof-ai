import type { OrgRole, Prisma } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/app-error.js';
import { ORG_WIDE_ROLES, ROLE_LABEL, roleHas, type Permission } from './permissions.js';

/**
 * Who is acting, in which organization, and on which projects. Built fresh on
 * every request, so a role change or removal takes effect immediately.
 */
export type Actor = {
  userId: string;
  organizationId: string;
  role: OrgRole;
  /** true for owners, admins and viewers; otherwise only `projectIds`. */
  allProjects: boolean;
  projectIds: string[];
};

export const ORG_HEADER = 'x-organization-id';

export async function loadActor(userId: string, organizationId: string): Promise<Actor | null> {
  const membership = await prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { role: true, status: true },
  });
  if (!membership || membership.status !== 'ACTIVE') return null;
  const allProjects = ORG_WIDE_ROLES.has(membership.role);
  const projectIds = allProjects
    ? []
    : (
        await prisma.projectMember.findMany({
          // The organization filter matters: an assignment can never widen scope
          // into another organization, even if bad data ever pointed there.
          where: { userId, project: { organizationId } },
          select: { projectId: true },
        })
      ).map((row) => row.projectId);
  return { userId, organizationId, role: membership.role, allProjects, projectIds };
}

export function can(actor: Actor, permission: Permission) {
  return roleHas(actor.role, permission);
}

export function requirePermission(actor: Actor, permission: Permission) {
  if (!can(actor, permission))
    throw new AppError(403, `Your role (${ROLE_LABEL[actor.role]}) does not allow this action`, undefined, 'FORBIDDEN');
}

export function inProjectScope(actor: Actor, projectId: string) {
  return actor.allProjects || actor.projectIds.includes(projectId);
}

/** Prisma filter for every project the actor may see. Always org-bounded. */
export function projectWhere(actor: Actor): Prisma.ProjectWhereInput {
  return {
    organizationId: actor.organizationId,
    ...(actor.allProjects ? {} : { id: { in: actor.projectIds } }),
  };
}

export function assetWhere(actor: Actor): Prisma.AssetWhereInput {
  return { project: projectWhere(actor) };
}

/**
 * Actor for list-style requests that have no resource to derive the org from:
 * the `X-Organization-Id` header if sent, else the user's oldest active membership.
 * A header naming an org the user is not in reads as "not found" so org IDs
 * cannot be probed.
 */
export async function actorFromRequest(req: Request): Promise<Actor> {
  const userId = req.userId!;
  const header = req.get(ORG_HEADER)?.trim();
  if (header) {
    const actor = /^[a-z0-9]{8,64}$/i.test(header) ? await loadActor(userId, header) : null;
    if (!actor) throw new AppError(404, 'Organization not found', undefined, 'ORG_NOT_FOUND');
    return actor;
  }
  const first = await prisma.membership.findFirst({
    where: { userId, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    select: { organizationId: true },
  });
  const actor = first && (await loadActor(userId, first.organizationId));
  if (!actor)
    throw new AppError(403, 'Create or join an organization to continue', undefined, 'NO_ORGANIZATION');
  return actor;
}

/**
 * Actor for a request about one project. The organization comes from the
 * project itself, never from the header, so links keep working whichever org
 * is active in the UI. Out-of-scope and nonexistent look identical (404).
 */
export async function actorForProject(
  userId: string,
  projectId: string,
  permission?: Permission,
  notFound = 'Project not found',
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, organizationId: true },
  });
  const actor = project ? await loadActor(userId, project.organizationId) : null;
  if (!project || !actor || !inProjectScope(actor, project.id)) throw new AppError(404, notFound);
  if (permission) requirePermission(actor, permission);
  return actor;
}

/** Actor for an organization-level request (`/orgs/:orgId/...`). */
export async function actorForOrganization(userId: string, organizationId: string, permission?: Permission) {
  const actor = await loadActor(userId, organizationId);
  if (!actor) throw new AppError(404, 'Organization not found', undefined, 'ORG_NOT_FOUND');
  if (permission) requirePermission(actor, permission);
  return actor;
}
